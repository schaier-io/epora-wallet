"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleSlash, Loader2, RefreshCw, Wallet } from "lucide-react";

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
import { nonAdminStreamingActionCooldownRemainingMs } from "@/lib/contracts/crank-cooldown";
import { EMPTY_CONTRACT_CONFIG, type ContractConfig } from "@/lib/types/contracts";
import { lovelaceToAdaNumber } from "@/lib/units/lovelace";
import { useWalletContext } from "@/providers/wallet-provider";
import {
  collectPayeeStreamingPayments,
  type PayeeStreamingPayment
} from "@/components/payee/collect-payee-streaming-payments";
import { computePayeeDueAmount } from "@/components/payee/payee-amounts";

type CancelState =
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
  const { activeWallet, activeAddress, activePaymentKeyHash, isDemoWallet } =
    useWalletContext();

  const [tokens, setTokens] = useState<DetectedSttToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelStates, setCancelStates] = useState<Record<string, CancelState>>({});
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

  const myPayments = useMemo(
    () => collectPayeeStreamingPayments(tokens, activePaymentKeyHash ?? ""),
    [tokens, activePaymentKeyHash]
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
        <CardHeader className="pb-3">
          <div className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div>
              <CardTitle>Scheduled payments to you</CardTitle>
              <CardDescription>
                Payments other wallets stream to your address. You can shorten a schedule
                to the current safe transaction time without reducing anything already
                owed. The wallet owner or quorum may reschedule it later.
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
                  ? "The demo wallet is read-only. Connect a real browser wallet from the menu in the top-right to stop payments."
                  : "Connect a browser wallet from the menu in the top-right to see payments scheduled to you."}
              </span>
            </div>
          ) : loading ? (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Looking for payments scheduled to you…
            </div>
          ) : loadError ? (
            <p className="text-sm text-rose-300">{loadError}</p>
          ) : myPayments.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
              <CircleSlash className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>No receiver-owned scheduled payments were found for your wallet.</span>
            </div>
          ) : (
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
                return (
                  <li
                    key={key}
                    className="rounded-lg border border-border/70 bg-card/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatAmountPerDay(payment)}</span>
                          {alreadyEnded ? (
                            <Badge variant="outline">Ended</Badge>
                          ) : cooldownBlocked ? (
                            <Badge variant="outline">Cooldown</Badge>
                          ) : (
                            <Badge variant="secondary">Active</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Runs {formatDate(payment.startDate)} → {formatDate(payment.endDate)}
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
                      <div className="flex flex-col items-end gap-1">
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
                        {state.status === "error" ? (
                          <span className="max-w-xs text-right text-xs text-rose-300">
                            {state.message}
                          </span>
                        ) : null}
                        {cooldownBlocked && state.status !== "error" ? (
                          <span className="max-w-xs text-right text-xs text-muted-foreground">
                            Shared receiver/payout cooldown. Try again around {formatDate(
                              renderNowMs + cooldownRemainingMs
                            )}.
                          </span>
                        ) : null}
                        {!alreadyEnded && !cooldownBlocked && cannotShorten ? (
                          <span className="max-w-xs text-right text-xs text-muted-foreground">
                            This schedule ends before the current safe transaction window can shorten it.
                          </span>
                        ) : null}
                        {state.status === "done" ? (
                          <span className="text-right text-xs text-emerald-300">
                            Submitted ({state.txHash.slice(0, 10)}…)
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
