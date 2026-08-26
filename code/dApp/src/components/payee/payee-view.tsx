"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { lovelaceToAdaNumber } from "@/lib/units/lovelace";
import { useWalletContext } from "@/providers/wallet-provider";
import {
  collectPayeeStreamingPayments,
  type PayeeStreamingPayment
} from "@/components/payee/collect-payee-streaming-payments";
import { computePayeeDueAmount } from "@/components/payee/payee-amounts";
import { runPayeeCollect } from "@/components/payee/payee-collect-tx";
import {
  describeEmptyScan,
  describeIncompleteScan
} from "@/components/payee/payee-scan-messages";

type RowActionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "done"; txHash: string }
  | { status: "error"; message: string };

function streamKey(payment: PayeeStreamingPayment): string {
  return `${payment.sttInputTxHash}#${payment.sttInputOutputIndex}:${payment.streamingPaymentId}`;
}

function assetLabel(policyId: string, assetName: string): string {
  if (policyId.length === 0 && assetName.length === 0) {
    return "ADA";
  }
  return assetName.length > 0 ? assetName : `${policyId.slice(0, 8)}…`;
}

function formatAmountPerDay(payment: PayeeStreamingPayment): string {
  if (payment.policyId.length === 0 && payment.assetName.length === 0) {
    return `${lovelaceToAdaNumber(payment.amountPerDay).toLocaleString()} ADA / day`;
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
    return `${lovelaceToAdaNumber(payment.paidOutAmount).toLocaleString()} ADA`;
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
    return `${lovelaceToAdaNumber(due).toLocaleString()} ADA`;
  }
  return `${Number(due).toLocaleString()} ${assetLabel(payment.policyId, payment.assetName)}`;
}

function formatDate(posixMs: number): string {
  return new Date(posixMs).toLocaleString();
}

export function PayeeView() {
  const { activeWallet, activeAddress, activePaymentKeyHash, isDemoWallet, networkId } =
    useWalletContext();

  const [tokens, setTokens] = useState<DetectedSttToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelStates, setCancelStates] = useState<Record<string, RowActionState>>({});
  const [collectStates, setCollectStates] = useState<Record<string, RowActionState>>({});
  const [renderNowMs, setRenderNowMs] = useState(() => Date.now());

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const detected = await detectSttInfo();
      setTokens(detected.tokens);
    } catch (error) {
      setTokens([]);
      setLoadError(
        error instanceof Error ? error.message : "Unable to load scheduled payments."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
   * The action that pays the payee. The contract has always allowed it — a stream's payee may
   * sign their own payout — but the page only ever offered `Shorten payment`, which reduces
   * their income. The paying wallet's own locked funds cover the payout; the payee signs.
   */
  const handleCollect = useCallback(
    async (payment: PayeeStreamingPayment) => {
      if (!activeWallet) {
        return;
      }
      const key = streamKey(payment);
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
        setCollectStates((prev) => ({ ...prev, [key]: { status: "done", txHash } }));
        // Re-read the advanced paid-out total and the shared cooldown stamp.
        void loadTokens();
      } catch (error) {
        setCollectStates((prev) => ({
          ...prev,
          [key]: {
            status: "error",
            message:
              error instanceof Error ? error.message : "Failed to collect the payment."
          }
        }));
      }
    },
    [activeWallet, activePaymentKeyHash, tokens, loadTokens]
  );

  const handleCancel = useCallback(
    async (payment: PayeeStreamingPayment) => {
      if (!activeWallet) {
        return;
      }
      const key = streamKey(payment);
      setCancelStates((prev) => ({ ...prev, [key]: { status: "submitting" } }));
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
        setCancelStates((prev) => ({ ...prev, [key]: { status: "done", txHash } }));
        // Re-read the shortened end date and shared cooldown stamp.
        void loadTokens();
      } catch (error) {
        setCancelStates((prev) => ({
          ...prev,
          [key]: {
            status: "error",
            message:
              error instanceof Error ? error.message : "Failed to stop the payment."
          }
        }));
      }
    },
    [activeWallet, loadTokens]
  );

  const connected = Boolean(activeAddress) && !isDemoWallet;
  const renderValidityWindow = getValidityWindow(renderNowMs);

  return (
    <div className="container flex flex-1 flex-col py-3 md:py-4">
      <Card className="w-full">
        <CardHeader>
          <div className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div>
              <CardTitle>Scheduled payments to you</CardTitle>
              <CardDescription>
                Payments other wallets send to you a little at a time. Collect what you are
                owed whenever you like. Shortening a payment stops it building up further,
                and never reduces what is already owed. The paying wallet’s owners can
                change a payment later.
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
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!connected ? (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {isDemoWallet
                  ? "The demo wallet can look, but it cannot sign. Connect your own wallet to collect or shorten payments."
                  : "No wallet is connected yet. Use the Connect button at the top of this page to see payments scheduled to you."}
              </span>
            </div>
          ) : networkId !== null && networkId !== 0 ? (
            // `/user` refuses to build on the wrong network in two places; this page had no
            // check at all. It reads Preprod state, so a mainnet wallet's key hash can never
            // match — without this it would report "no payments to you" and sound definitive.
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              <CircleSlash className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Your wallet is on Cardano mainnet. Epora runs on the Preprod test network, so
                nothing on this page can find payments made to you. Switch your wallet to
                Preprod, then press Refresh.
              </span>
            </div>
          ) : loading ? (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Looking for payments scheduled to you…
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
                const state = cancelStates[key] ?? { status: "idle" };
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
                const submitting = state.status === "submitting";
                const done = state.status === "done";
                const collectState = collectStates[key] ?? { status: "idle" };
                const collecting = collectState.status === "submitting";
                const collected = collectState.status === "done";
                const nothingOwed =
                  BigInt(computePayeeDueAmount(payment, renderValidityWindow.earliestTimeMs)) <= 0n;
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
                            <Badge variant="outline">Ended</Badge>
                          ) : cooldownBlocked ? (
                            <Badge variant="outline">On hold</Badge>
                          ) : (
                            <Badge variant="secondary">Active</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          From {payment.payerWalletName} · runs {formatDate(payment.startDate)}{" "}
                          to {formatDate(payment.endDate)}
                        </p>
                        <p className="text-sm text-foreground">
                          <span className="text-muted-foreground">Owed to you now: </span>
                          <span className="font-medium tabular-nums">
                            {formatDueNow(payment, renderNowMs)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Paid out so far: {formatPaidOut(payment)} ·
                          payment #{payment.streamingPaymentId}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={collecting || collected || cooldownBlocked || nothingOwed}
                          aria-busy={collecting}
                          onClick={() => void handleCollect(payment)}
                        >
                          {collecting ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <HandCoins className="h-4 w-4" aria-hidden="true" />
                          )}
                          {collected ? "Collected" : collecting ? "Collecting…" : "Collect payment"}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={
                            submitting ||
                            done ||
                            alreadyEnded ||
                            cooldownBlocked ||
                            cannotShorten
                          }
                          aria-busy={submitting}
                          onClick={() => void handleCancel(payment)}
                        >
                          {submitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <CircleSlash className="h-4 w-4" aria-hidden="true" />
                          )}
                          {done ? "Shortened" : submitting ? "Shortening…" : "Shorten payment"}
                        </Button>
                        </div>
                        {collectState.status === "error" ? (
                          <span role="alert" className="max-w-xs text-right text-xs text-rose-300">
                            {collectState.message}
                          </span>
                        ) : null}
                        {collectState.status === "done" ? (
                          <span className="text-right text-xs text-emerald-300">
                            Transaction {collectState.txHash.slice(0, 10)}…
                          </span>
                        ) : null}
                        {nothingOwed && !cooldownBlocked && collectState.status === "idle" ? (
                          <span className="max-w-xs text-right text-xs text-muted-foreground">
                            Nothing is owed to you yet. The amount grows each day the schedule runs.
                          </span>
                        ) : null}
                        {state.status === "error" ? (
                          <span role="alert" className="max-w-xs text-right text-xs text-rose-300">
                            {state.message}
                          </span>
                        ) : null}
                        {cooldownBlocked && state.status !== "error" ? (
                          <span className="max-w-xs text-right text-xs text-muted-foreground">
                            Somebody other than an owner just acted on this wallet. It
                            allows that once every{" "}
                            {NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS / 60_000} minutes. Try
                            again around {formatDate(renderNowMs + cooldownRemainingMs)}.
                          </span>
                        ) : null}
                        {!alreadyEnded && !cooldownBlocked && cannotShorten ? (
                          <span className="max-w-xs text-right text-xs text-muted-foreground">
                            This payment ends too soon to shorten. It will finish on its own.
                          </span>
                        ) : null}
                        {state.status === "done" ? (
                          <span className="text-right text-xs text-emerald-300">
                            Transaction {state.txHash.slice(0, 10)}…
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
        </CardContent>
      </Card>
    </div>
  );
}
