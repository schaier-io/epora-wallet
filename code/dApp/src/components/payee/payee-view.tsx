"use client";
import { useTranslations } from "next-intl";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { detectSttInfo, type DetectedSttToken } from "@/lib/mesh/detection";
import { buildSttSpendTx, getValidityWindow, signAndSubmitTx } from "@/lib/mesh/transactions";
import {
  NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS,
  nonAdminStreamingActionCooldownRemainingMs
} from "@/lib/contracts/crank-cooldown";
import { EMPTY_CONTRACT_CONFIG, type ContractConfig } from "@/lib/types/contracts";
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

type RowActionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "done"; txHash: string }
  | { status: "error"; message: string };

type StateInputActionPhase = "building" | "submitted";

function streamKey(payment: PayeeStreamingPayment): string {
  return `${payment.sttInputTxHash}#${payment.sttInputOutputIndex}:${payment.streamingPaymentId}`;
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

// `toLocaleString()` on an ADA number keeps three decimals, so 400 lovelace a
// day read as "0 ADA / day"; the lovelace formatter keeps all six.
function formatAmountPerDay(payment: PayeeStreamingPayment): string {
  if (payment.policyId.length === 0 && payment.assetName.length === 0) {
    return `${formatLovelaceAsAda(String(payment.amountPerDay))} ADA / day`;
  }
  return `${payment.amountPerDay.toLocaleString()} ${assetLabel(payment.policyId, payment.assetName)} / day`;
}

/**
 * The running total, in the same unit as the rate above it. Mirrors `formatAmountPerDay`
 * deliberately: printing the raw datum integer here put `5 ADA / day` and `10,000,000` in
 * one row, a factor of a million apart with only one of them carrying a unit.
 */
function formatPaidOut(payment: PayeeStreamingPayment): string {
  if (payment.policyId.length === 0 && payment.assetName.length === 0) {
    return `${formatLovelaceAsAda(String(payment.paidOutAmount))} ADA`;
  }
  return `${payment.paidOutAmount.toLocaleString()} ${assetLabel(payment.policyId, payment.assetName)}`;
}

/**
 * What is owed right now, in the same unit as the rate and the running total above it.
 * `computePayeeDueAmount` runs the payer's own calculation, so the two sides cannot disagree.
 */
function formatDueNow(payment: PayeeStreamingPayment, nowMs: number): string {
  const due = computePayeeDueAmount(payment, nowMs);
  if (payment.policyId.length === 0 && payment.assetName.length === 0) {
    return `${formatLovelaceAsAda(due)} ADA`;
  }
  return `${BigInt(due).toLocaleString()} ${assetLabel(payment.policyId, payment.assetName)}`;
}

function formatDate(posixMs: number): string {
  return new Date(posixMs).toLocaleString();
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
  const stateInputActionsRef = useRef(new Map<string, StateInputActionPhase>());
  const [pendingStateInputs, setPendingStateInputs] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [renderNowMs, setRenderNowMs] = useState(() => Date.now());

  const beginStateInputAction = useCallback((key: string): boolean => {
    if (stateInputActionsRef.current.has(key)) {
      return false;
    }
    stateInputActionsRef.current.set(key, "building");
    setPendingStateInputs((current) => new Set(current).add(key));
    return true;
  }, []);

  const markStateInputSubmitted = useCallback((key: string) => {
    if (stateInputActionsRef.current.has(key)) {
      stateInputActionsRef.current.set(key, "submitted");
    }
  }, []);

  const endStateInputAction = useCallback((key: string) => {
    stateInputActionsRef.current.delete(key);
    setPendingStateInputs((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }, []);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const detected = await detectSttInfo();
      setTokens(detected.tokens);
      const detectedInputKeys = new Set(detected.tokens.map(detectedStateInputKey));
      for (const [key, phase] of stateInputActionsRef.current) {
        if (phase === "submitted" && !detectedInputKeys.has(key)) {
          endStateInputAction(key);
        }
      }
    } catch (error) {
      console.error("[payee:load]", error);
      setTokens([]);
      setLoadError(i18n("unableToLoadScheduledPayments"));
    } finally {
      setLoading(false);
    }
  }, [endStateInputAction, i18n]);

  useEffect(() => {
    // Legitimate data-fetch effect (loads detected scheduled payments from chain).
    void loadTokens();
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
      const inputKey = stateInputKey(payment);
      if (!beginStateInputAction(inputKey)) {
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
          throw new Error(
            "The wallet holding this payment could not be read again. Press Refresh and try once more."
          );
        }
        const txHash = await runPayeeCollect({
          wallet: activeWallet,
          payment,
          stateDatum: token.datum,
          payeePaymentKeyHash: activePaymentKeyHash ?? "",
          nowMs: Date.now()
        });
        submitted = true;
        markStateInputSubmitted(inputKey);
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
                : i18n("failedToCollectThePayment")
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
      const inputKey = stateInputKey(payment);
      if (!beginStateInputAction(inputKey)) {
        return;
      }
      let submitted = false;
      setActionAnnouncement("");
      setShortenStates((prev) => ({ ...prev, [key]: { status: "submitting" } }));
      try {
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
          validityWindowReferenceTimeMs: Date.now()
        });
        const txHash = await signAndSubmitTx(activeWallet, build.txHex);
        submitted = true;
        markStateInputSubmitted(inputKey);
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
            message: i18n("failedToStopThePayment")
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
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {i18n("lookingForPaymentsScheduledToYou")}
            </div>
          ) : loadError ? (
            <p role="alert" className="text-sm text-rose-300">
              {loadError}
            </p>
          ) : myPayments.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
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
                const stateInputPending = pendingStateInputs.has(stateInputKey(payment));
                const shortenState = shortenStates[key] ?? { status: "idle" };
                const alreadyEnded = payment.endDate <= renderNowMs;
                const cooldownRemainingMs = nonAdminStreamingActionCooldownRemainingMs(
                  payment.lastNonAdminPayoutAt,
                  renderValidityWindow.earliestTimeMs
                );
                const cooldownBlocked = cooldownRemainingMs > 0;
                const earliestSafeCutoff = Math.max(
                  payment.startDate,
                  renderValidityWindow.latestTimeMs
                );
                const cannotShorten = earliestSafeCutoff >= payment.endDate;
                const shortening = shortenState.status === "submitting";
                const shortened = shortenState.status === "done";
                const collectState = collectStates[key] ?? { status: "idle" };
                const collecting = collectState.status === "submitting";
                const collected = collectState.status === "done";
                const nothingOwed =
                  BigInt(computePayeeDueAmount(payment, renderValidityWindow.earliestTimeMs)) <= 0n;
                // One line per row. Up to five used to stack here, so a row could carry an
                // error, a transaction id, a cooldown and a "nothing owed" note at once.
                const status: { text: string; tone: "error" | "done" | "note" } | null =
                  collectState.status === "error"
                    ? { text: collectState.message, tone: "error" }
                    : shortenState.status === "error"
                      ? { text: shortenState.message, tone: "error" }
                      : collected || shortened
                        ? { text: i18n("sentTheListUpdatesAfterTheNextRefresh"), tone: "done" }
                        : cooldownBlocked
                          ? {
                              text: `${i18n("somebodyOtherThanAnOwnerJustActedOn")} ${NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS / 60_000} ${i18n("minutesTryAgainAround")} ${formatDate(renderNowMs + cooldownRemainingMs)}.`,
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
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatAmountPerDay(payment)}</span>
                          {alreadyEnded ? (
                            <Badge variant="outline">{i18n("ended")}</Badge>
                          ) : cooldownBlocked ? (
                            <Badge variant="outline">{i18n("onHold")}</Badge>
                          ) : (
                            <Badge variant="secondary">{i18n("active")}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {i18n("from")} {payment.payerWalletName} {i18n("runs")} {formatDate(payment.startDate)}{" "}
                          {i18n("to")} {formatDate(payment.endDate)}
                        </p>
                        <p className="text-sm text-foreground">
                          <span className="text-muted-foreground">{i18n("owedToYouNow")} </span>
                          <span className="font-medium tabular-nums">
                            {formatDueNow(payment, renderNowMs)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {i18n("paidOutSoFar")} {formatPaidOut(payment)} {i18n("payment")}{payment.streamingPaymentId}
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
                            cooldownBlocked ||
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
                              cooldownBlocked ||
                              cannotShorten
                            }
                            aria-busy={shortening}
                            onClick={() => void handleShorten(payment)}
                          >
                            {shortened ? i18n("shortened") : shortening ? i18n("shortening") : i18n("shortenPayment")}
                          </Button>
                        ) : null}
                        {status ? (
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
