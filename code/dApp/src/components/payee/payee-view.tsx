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
import { buildSttSpendTx, signAndSubmitTx } from "@/lib/mesh/transactions";
import { EMPTY_CONTRACT_CONFIG, type ContractConfig } from "@/lib/types/contracts";
import { useWalletContext } from "@/providers/wallet-provider";
import {
  collectPayeeStreamingPayments,
  type PayeeStreamingPayment
} from "@/components/payee/collect-payee-streaming-payments";

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
    return `${(payment.amountPerDay / 1_000_000).toLocaleString()} ADA / day`;
  }
  return `${payment.amountPerDay.toLocaleString()} ${assetLabel(payment.policyId, payment.assetName)} / day`;
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
        // Re-read on-chain state so the stopped stream drops out of the list.
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

  return (
    <div className="container flex flex-1 flex-col py-3 md:py-4">
      <Card className="w-full">
        <CardHeader className="pb-3">
          <div className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div>
              <CardTitle>Scheduled payments to you</CardTitle>
              <CardDescription>
                Payments other wallets stream to your address. You can stop any of them —
                that ends future payments from now on. Anything already owed to you is
                untouched.
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
              <span>No active payments are scheduled to your wallet right now.</span>
            </div>
          ) : (
            <ul className="space-y-3">
              {myPayments.map((payment) => {
                const key = streamKey(payment);
                const state = cancelStates[key] ?? { status: "idle" };
                const alreadyEnded = payment.endDate <= Date.now();
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
                          ) : (
                            <Badge variant="secondary">Active</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Runs {formatDate(payment.startDate)} → {formatDate(payment.endDate)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Paid out so far: {payment.paidOutAmount.toLocaleString()} ·
                          payment #{payment.streamingPaymentId}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={submitting || done || alreadyEnded}
                          aria-busy={submitting}
                          onClick={() => void handleCancel(payment)}
                        >
                          {submitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <CircleSlash className="h-4 w-4" aria-hidden="true" />
                          )}
                          {done ? "Stopped" : submitting ? "Stopping…" : "Stop payment"}
                        </Button>
                        {state.status === "error" ? (
                          <span className="max-w-xs text-right text-xs text-rose-300">
                            {state.message}
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
