"use client";
import { useTranslations } from "next-intl";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { CircleSlash, HandCoins, Loader2, RefreshCw, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { detectSttInfo, type DetectedSttToken } from "@/lib/mesh/detection";
import { buildSttSpendTx, getValidityWindow, signAndSubmitTx } from "@/lib/mesh/transactions";
import {
  NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS,
  crankSignerBypassesCooldown,
  nonAdminStreamingActionCooldownRemainingMs
} from "@/lib/contracts/crank-cooldown";
import { EMPTY_CONTRACT_CONFIG, type ContractConfig } from "@/lib/types/contracts";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";
import { useWalletContext } from "@/providers/wallet-provider";
import {
  collectPayeeStreamingPayments,
  type PayeeStreamingPayment
} from "@/components/payee/collect-payee-streaming-payments";
import { computePayeeDueAmount } from "@/components/payee/payee-amounts";
import {
  PayeeCollectBlockedError,
  runPayeeCollect
} from "@/components/payee/payee-collect-tx";
import {
  describeEmptyScan,
  describeIncompleteScan
} from "@/components/payee/payee-scan-messages";
import {
  beginPayeeInputActionAtom,
  markPayeeInputSubmittedAtom,
  payeePendingInputKey,
  pendingPayeeInputActionsAtom,
  reconcilePayeeInputsAtom,
  releasePayeeInputActionAtom
} from "@/components/payee/payee-pending-inputs.atoms";

type RowActionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "done"; txHash: string }
  | { status: "error"; message: string };

function streamKey(payment: PayeeStreamingPayment): string {
  return `${payment.sttPolicyId}:${stateInputKey(payment)}:${payment.streamingPaymentId}`;
}

function stateInputKey(payment: PayeeStreamingPayment): string {
  return `${payment.sttInputTxHash}#${payment.sttInputOutputIndex}`;
}

function detectedStateInputKey(token: DetectedSttToken): string {
  return `${token.utxo.input.txHash}#${token.utxo.input.outputIndex}`;
}

// The datum carries the asset name as hex bytes; the reader gets the decoded name.
function assetLabel(policyId: string, assetName: string): string {
  if (policyId.length === 0 && assetName.length === 0) {
    return "ADA";
  }
  return resolveAssetIdentity(`${policyId}${assetName}`).symbol;
}

/**
 * A figure and the unit it is counted in, kept apart so the catalog owns the sentence that
 * joins them rather than a template literal here. Every figure in a row goes through this one
 * function deliberately: printing the raw datum integer beside the rate put `5 ADA per day`
 * and `10,000,000` in one row, a factor of a million apart with only one carrying a unit.
 * The due figure comes from `computePayeeDueAmount`, which runs the payer's own calculation,
 * so the two sides cannot disagree about what is owed.
 */
function amountParts(
  value: string | number | bigint,
  payment: PayeeStreamingPayment
): { amount: string; asset: string } {
  if (payment.policyId.length === 0 && payment.assetName.length === 0) {
    return { amount: formatLovelaceAsAda(String(value)), asset: "ADA" };
  }
  return {
    amount: BigInt(value).toLocaleString(),
    asset: assetLabel(payment.policyId, payment.assetName)
  };
}

function formatDate(posixMs: number | bigint): string {
  const asNumber = Number(posixMs);
  const date = new Date(asNumber);
  return Number.isSafeInteger(asNumber) && Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : posixMs.toString();
}

/**
 * A submitted transaction hash. Shown truncated because all 64 characters wrap the row, but
 * the full value has to stay reachable: it is the only handle the reader has for looking the
 * payout up. `title` covers a pointer, the copy control covers touch and keyboard. The
 * page announces submission through its persistent action status.
 */
function SubmittedTransaction({ txHash }: { txHash: string }) {
  const i18n = useTranslations("ComponentsPayeePayeeView");
  return (
    <span className="flex items-center gap-1">
      <span
        title={txHash}
        className="font-mono text-xs tabular-nums text-emerald-300"
      >
        {i18n("transactionSubmitted", { hash: `${txHash.slice(0, 10)}…` })}
      </span>
      <CopyButton value={txHash} hideLabel variant="ghost" className="h-6 px-1.5" />
    </span>
  );
}

export function PayeeView() {
  const i18n = useTranslations("ComponentsPayeePayeeView");
  const { activeWallet, activeAddress, activePaymentKeyHash, isDemoWallet, networkId } =
    useWalletContext();

  const [tokens, setTokens] = useState<DetectedSttToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shortenStates, setShortenStates] = useState<Record<string, RowActionState>>({});
  const [collectStates, setCollectStates] = useState<Record<string, RowActionState>>({});
  const [actionAnnouncement, setActionAnnouncement] = useState("");
  const pendingStateInputs = useAtomValue(pendingPayeeInputActionsAtom);
  const beginStateInputAction = useSetAtom(beginPayeeInputActionAtom);
  const markStateInputSubmitted = useSetAtom(markPayeeInputSubmittedAtom);
  const endStateInputAction = useSetAtom(releasePayeeInputActionAtom);
  const reconcileStateInputs = useSetAtom(reconcilePayeeInputsAtom);
  const [renderNowMs, setRenderNowMs] = useState(() => Date.now());
  const mountedRef = useRef(true);

  // One ticket per load. Two rows held in different wallets can be acted on together,
  // because the list stays on screen while the first transaction is still being signed,
  // so the reload each action ends with can overlap the other. Without the ticket the
  // slower read wins whenever it lands last: it can put back older chain data, raise a
  // load error over a newer clean read, or clear the spinner of a load still running.
  const loadRequestRef = useRef(0);

  const loadTokens = useCallback(async () => {
    if (!mountedRef.current) return;
    const request = (loadRequestRef.current += 1);
    const isCurrent = () => mountedRef.current && request === loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const detected = await detectSttInfo();
      if (!isCurrent()) {
        return;
      }
      // The lock and the list have to come from the same read. A lock is cleared exactly when
      // the snapshot the view adopts stops showing the state input, which is the same moment
      // the row it belongs to leaves the list, so the two can never disagree.
      //
      // Clearing it from a superseded read instead splits them apart, in both directions. The
      // row stays on screen from the newest read with its buttons live again over an input its
      // own transaction already spends. And removing the row to compensate hides a payment
      // that is still there: a collect respends the state input into a successor, which the
      // superseded read holds and the newest read does not, so the payment vanishes from the
      // list until the reader presses Refresh.
      //
      // The cost is a row that stays disabled when a superseded read saw the spend and the
      // newest read did not. That reads correctly: the freshest data still shows the input, so
      // this transaction is not visible on chain yet, and the row must not be acted on again.
      // The next read clears it.
      const detectedInputKeys = new Set(detected.tokens.map(detectedStateInputKey));
      reconcileStateInputs({ policyId: detected.policyId, inputKeys: detectedInputKeys });
      setTokens(detected.tokens);
    } catch (error) {
      if (!isCurrent()) {
        return;
      }
      console.error("[payee:load]", error);
      setTokens([]);
      setLoadError(i18n("unableToLoadScheduledPayments"));
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  }, [reconcileStateInputs, i18n]);

  useEffect(() => {
    // Legitimate data-fetch effect (loads detected scheduled payments from chain).
    mountedRef.current = true;
    void loadTokens();
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
    };
  }, [loadTokens]);

  useEffect(() => {
    const timer = window.setInterval(() => setRenderNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const scan = useMemo(
    () => collectPayeeStreamingPayments(tokens, activePaymentKeyHash ?? ""),
    [tokens, activePaymentKeyHash]
  );
  const myPayments = scan.payments;

  /**
   * The action that pays the payee. The contract has always allowed it: a stream's payee may
   * sign their own payout, but the page only ever offered `Shorten payment`, which reduces
   * their income. The paying wallet's own locked funds cover the payout; the payee signs.
   */
  const handleCollect = useCallback(
    async (payment: PayeeStreamingPayment) => {
      if (!activeWallet) {
        return;
      }
      const key = streamKey(payment);
      const inputKey = payeePendingInputKey(payment.sttPolicyId, stateInputKey(payment));
      if (!beginStateInputAction({
        policyId: payment.sttPolicyId,
        stateInput: stateInputKey(payment),
        streamKey: key,
        action: "collect"
      })) {
        return;
      }
      let submitted = false;
      setActionAnnouncement("");
      setCollectStates((prev) => ({ ...prev, [key]: { status: "submitting" } }));
      try {
        const token = tokens.find(
          (candidate) =>
            candidate.utxo.input.txHash === payment.sttInputTxHash &&
            candidate.utxo.input.outputIndex === payment.sttInputOutputIndex
        );
        if (!token?.datum) {
          // A plain Error here fell past the `instanceof` test in the catch below, so
          // this sentence never reached the user: they got the generic collect failure.
          throw new PayeeCollectBlockedError(i18n("theWalletHoldingThisPaymentCouldNotBe"));
        }
        const txHash = await runPayeeCollect({
          wallet: activeWallet,
          payment,
          stateDatum: token.datum,
          payeePaymentKeyHash: activePaymentKeyHash ?? "",
          nowMs: Date.now(),
          confirmWarnings: (warnings) =>
            window.confirm(
              i18n("reviewTheseWarningsBeforeYouSignContinue", {
                warnings: warnings.join("\n\n")
              })
            )
        });
        submitted = true;
        markStateInputSubmitted({ key: inputKey, txHash });
        setCollectStates((prev) => ({ ...prev, [key]: { status: "done", txHash } }));
        setActionAnnouncement(i18n("sentTheListUpdatesAfterTheNextRefresh"));
        // Re-read the advanced paid-out total and the shared cooldown stamp.
        await loadTokens();
      } catch (error) {
        console.error("[payee:collect]", error);
        setCollectStates((prev) => ({
          ...prev,
          [key]: {
            status: "error",
            message:
              error instanceof PayeeCollectBlockedError
                ? error.message
                : getUserFacingErrorMessage(error, i18n("failedToCollectThePayment"))
          }
        }));
      } finally {
        if (!submitted) {
          endStateInputAction(inputKey);
        }
      }
    },
    [
      activeWallet,
      activePaymentKeyHash,
      tokens,
      loadTokens,
      i18n,
      beginStateInputAction,
      markStateInputSubmitted,
      endStateInputAction
    ]
  );

  const handleShorten = useCallback(
    async (payment: PayeeStreamingPayment) => {
      if (!activeWallet) {
        return;
      }
      const key = streamKey(payment);
      const inputKey = payeePendingInputKey(payment.sttPolicyId, stateInputKey(payment));
      if (!beginStateInputAction({
        policyId: payment.sttPolicyId,
        stateInput: stateInputKey(payment),
        streamKey: key,
        action: "shorten"
      })) {
        return;
      }
      let submitted = false;
      setActionAnnouncement("");
      setShortenStates((prev) => ({ ...prev, [key]: { status: "submitting" } }));
      try {
        const validityWindowReferenceTimeMs = Date.now();
        const config: ContractConfig = {
          ...EMPTY_CONTRACT_CONFIG,
          walletPolicyId: payment.sttPolicyId,
          walletAssetNameHex: payment.sttAssetNameHex,
          sttAssetNameHex: payment.sttAssetNameHex
        };
        const build = await buildSttSpendTx(activeWallet, config, "cancel-streaming-payment", {
          sttInputTxHash: payment.sttInputTxHash,
          sttInputOutputIndex: payment.sttInputOutputIndex,
          streamingPaymentCancelId: payment.streamingPaymentId,
          // Ignored for cancel (the forwarded datum is derived on chain-mirror),
          // but required by the input type.
          outputDatum: { alternative: 0, fields: [] },
          outputAssets: [],
          validityWindowReferenceTimeMs
        });
        const txHash = await signAndSubmitTx(activeWallet, build.txHex);
        submitted = true;
        markStateInputSubmitted({ key: inputKey, txHash });
        setShortenStates((prev) => ({ ...prev, [key]: { status: "done", txHash } }));
        setActionAnnouncement(i18n("sentTheListUpdatesAfterTheNextRefresh"));
        // Re-read the shortened end date and shared cooldown stamp.
        await loadTokens();
      } catch (error) {
        console.error("[payee:shorten]", error);
        setShortenStates((prev) => ({
          ...prev,
          [key]: {
            status: "error",
            // A declined signature is not a failed payment. Classify first, and only
            // fall back to the generic sentence when the cause is not recognised.
            message: getUserFacingErrorMessage(error, i18n("failedToStopThePayment"))
          }
        }));
      } finally {
        if (!submitted) {
          endStateInputAction(inputKey);
        }
      }
    },
    [
      activeWallet,
      loadTokens,
      i18n,
      beginStateInputAction,
      markStateInputSubmitted,
      endStateInputAction
    ]
  );

  // The demo wallet can read the list; it cannot sign, so the buttons stay off and one note
  // above the list says why. It used to get the note instead of the list.
  const canSign = Boolean(activeWallet) && !isDemoWallet;
  const renderValidityWindow = getValidityWindow(renderNowMs);

  return (
    <div className="container flex flex-col py-3 md:py-4">
      <Card className="flex w-full flex-col">
        <CardHeader>
          <div className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div>
              {/* The page's own heading. `/payee` holds one card and this names it, so the
                  page no longer carries a hidden `h1` saying the same words at a different
                  level. */}
              <CardTitle as="h1">{i18n("scheduledPaymentsToYou")}</CardTitle>
              <CardDescription>
                {i18n("paymentsOtherWalletsSendToYouALittle")}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadTokens()}
              disabled={loading}
              aria-busy={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              {i18n("refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
          <p role="status" aria-live="polite" className="sr-only">
            {actionAnnouncement}
          </p>
          {!activeAddress ? (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{i18n("noWalletIsConnectedYetUseTheConnect")}</span>
            </div>
          ) : networkId !== null && networkId !== 0 ? (
            // `/user` refuses to build on the wrong network in two places; this page had no
            // check at all. It reads Preprod state, so a mainnet wallet's key hash can never
            // match. Without this it would report "no payments to you" and sound definitive.
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              <CircleSlash className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {i18n("yourWalletIsOnCardanoMainnetEporaRuns")}
              </span>
            </div>
          ) : (
            <>
            {isDemoWallet ? (
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
                <Wallet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{i18n("theDemoWalletCannotSignSoConnectYour")}</span>
              </div>
            ) : null}
            {loading ? (
            <div role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {i18n("lookingForPaymentsScheduledToYou")}
            </div>
          ) : loadError ? (
            <p role="alert" className="text-sm text-rose-300">
              {loadError}
            </p>
          ) : myPayments.length === 0 ? (
            <div
              role="status"
              className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground"
            >
              <CircleSlash className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{describeEmptyScan(scan)}</span>
            </div>
          ) : (
            <>
            {describeIncompleteScan(scan) ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                {describeIncompleteScan(scan)}
              </p>
            ) : null}
            <ul className="space-y-3">
              {myPayments.map((payment) => {
                const key = streamKey(payment);
                const pending = pendingStateInputs[
                  payeePendingInputKey(payment.sttPolicyId, stateInputKey(payment))
                ];
                const stateInputPending = Boolean(pending);
                const pendingRowState: RowActionState | null = pending?.streamKey !== key
                  ? null
                  : pending.phase === "building"
                    ? { status: "submitting" }
                    : { status: "done", txHash: pending.txHash };
                const shortenState = (pending?.action === "shorten" ? pendingRowState : null)
                  ?? shortenStates[key] ?? { status: "idle" };
                const alreadyEnded = BigInt(payment.endDate) <= BigInt(renderNowMs);
                const stateDatum = tokens.find(
                  (token) => detectedStateInputKey(token) === stateInputKey(payment)
                )?.datum;
                const collectBypassesCooldown = Boolean(
                  stateDatum &&
                  activePaymentKeyHash &&
                  crankSignerBypassesCooldown(
                    stateDatum,
                    activePaymentKeyHash,
                    renderValidityWindow.earliestTimeMs
                  )
                );
                const cooldownRemainingMs = nonAdminStreamingActionCooldownRemainingMs(
                  payment.lastNonAdminPayoutAt,
                  renderValidityWindow.earliestTimeMs
                );
                const collectCooldownBlocked =
                  !collectBypassesCooldown && cooldownRemainingMs > 0;
                const shortenCooldownBlocked = cooldownRemainingMs > 0;
                const earliestSafeCutoff = BigInt(payment.startDate) > BigInt(renderValidityWindow.latestTimeMs)
                  ? BigInt(payment.startDate)
                  : BigInt(renderValidityWindow.latestTimeMs);
                const cannotShorten = earliestSafeCutoff >= BigInt(payment.endDate);
                const shortening = shortenState.status === "submitting";
                const shortened = shortenState.status === "done";
                const collectState = (pending?.action === "collect" ? pendingRowState : null)
                  ?? collectStates[key] ?? { status: "idle" };
                const collecting = collectState.status === "submitting";
                const collected = collectState.status === "done";
                const nothingOwed =
                  BigInt(computePayeeDueAmount(payment, renderValidityWindow.earliestTimeMs)) <= 0n;
                const submittedTxHash = collectState.status === "done"
                  ? collectState.txHash
                  : shortenState.status === "done" ? shortenState.txHash : null;
                // One line per row. Up to five used to stack here, so a row could carry an
                // error, a transaction id, a cooldown and a "nothing owed" note at once.
                const status: { text: string; tone: "error" | "done" | "note" } | null =
                  collectState.status === "error"
                    ? { text: collectState.message, tone: "error" }
                    : shortenState.status === "error"
                      ? { text: shortenState.message, tone: "error" }
                      : collected || shortened
                        ? { text: i18n("sentTheListUpdatesAfterTheNextRefresh"), tone: "done" }
                        : collectCooldownBlocked
                          ? {
                              text: i18n("cooldownHolding", {
                                minutes: NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS / 60_000,
                                time: formatDate(renderNowMs + cooldownRemainingMs)
                              }),
                              tone: "note"
                            }
                          : nothingOwed
                            ? { text: i18n("nothingIsOwedToYouYetTheAmount"), tone: "note" }
                            : !alreadyEnded && cannotShorten
                              ? { text: i18n("thisPaymentEndsTooSoonToShortenIt"), tone: "note" }
                              : null;
                return (
                  <li
                    key={key}
                    className="rounded-lg border border-border/70 bg-card/60 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 wrap-anywhere font-medium tabular-nums">
                            {i18n("amountPerDay", amountParts(payment.amountPerDay, payment))}
                          </span>
                          {alreadyEnded ? (
                            <Badge variant="outline" className="shrink-0">{i18n("ended")}</Badge>
                          ) : collectCooldownBlocked ? (
                            <Badge variant="outline" className="shrink-0">{i18n("onHold")}</Badge>
                          ) : (
                            <Badge variant="secondary" className="shrink-0">{i18n("active")}</Badge>
                          )}
                        </div>
                        <p className="wrap-anywhere text-sm text-muted-foreground">
                          {i18n("runsFromTo", {
                            payer: payment.payerWalletName,
                            start: formatDate(payment.startDate),
                            end: formatDate(payment.endDate)
                          })}
                        </p>
                        <p className="wrap-anywhere text-sm text-foreground">
                          <span className="text-muted-foreground">{i18n("owedToYouNow")} </span>
                          <span className="font-medium tabular-nums">
                            {i18n(
                              "amount",
                              amountParts(computePayeeDueAmount(payment, renderNowMs), payment)
                            )}
                          </span>
                        </p>
                        <p className="wrap-anywhere text-xs tabular-nums text-muted-foreground">
                          {i18n("paidOutSoFar", {
                            amount: i18n(
                              "amount",
                              amountParts(payment.paidOutAmount, payment)
                            ),
                            id: String(payment.streamingPaymentId)
                          })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            !canSign ||
                            stateInputPending ||
                            collected ||
                            collectCooldownBlocked ||
                            nothingOwed
                          }
                          aria-busy={collecting}
                          onClick={() => void handleCollect(payment)}
                        >
                          {collecting ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <HandCoins className="h-4 w-4" aria-hidden="true" />
                          )}
                          {collected ? i18n("collected") : collecting ? i18n("collecting") : i18n("collectPayment")}
                        </Button>
                        {/* Shortening cuts the reader's own income, so it is a quiet link, not
                            a red button beside Collect. */}
                        {!alreadyEnded ? (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs text-muted-foreground"
                            disabled={
                              !canSign ||
                              stateInputPending ||
                              shortened ||
                              shortenCooldownBlocked ||
                              cannotShorten
                            }
                            aria-busy={shortening}
                            onClick={() => void handleShorten(payment)}
                          >
                            {shortened ? i18n("shortened") : shortening ? i18n("shortening") : i18n("shortenPayment")}
                          </Button>
                        ) : null}
                        {status?.tone === "done" && submittedTxHash ? (
                          <SubmittedTransaction txHash={submittedTxHash} />
                        ) : status ? (
                          <span
                            role={status.tone === "error" ? "alert" : undefined}
                            className={`max-w-xs text-right text-xs ${
                              status.tone === "error"
                                ? "text-rose-300"
                                : status.tone === "done"
                                  ? "text-emerald-300"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {status.text}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            </>
          )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
