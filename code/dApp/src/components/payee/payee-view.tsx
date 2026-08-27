"use client";
import { useFormatter, useTranslations } from "next-intl";

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
import { getUserFacingErrorMessage } from "@/lib/utils/errors";
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

function formatAmountPerDay(
  payment: PayeeStreamingPayment,
  formatNumber: (value: number | bigint) => string,
  formatLabel: (amount: string, asset: string) => string
): string {
  if (payment.policyId.length === 0 && payment.assetName.length === 0) {
    return formatLabel(formatNumber(lovelaceToAdaNumber(payment.amountPerDay)), "ADA");
  }
  return formatLabel(
    formatNumber(payment.amountPerDay),
    assetLabel(payment.policyId, payment.assetName)
  );
}

function formatPaidAmount(
  payment: PayeeStreamingPayment,
  formatNumber: (value: number | bigint) => string,
  formatLabel: (amount: string, asset: string) => string
): string {
  if (payment.policyId.length === 0 && payment.assetName.length === 0) {
    return formatLabel(formatNumber(lovelaceToAdaNumber(payment.paidOutAmount)), "ADA");
  }
  return formatLabel(
    formatNumber(payment.paidOutAmount),
    assetLabel(payment.policyId, payment.assetName)
  );
}

export function PayeeView() {
  const i18n = useTranslations("ComponentsPayeePayeeView");
  const format = useFormatter();
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
      setLoadError(getUserFacingErrorMessage(error, i18n("couldnTLoadScheduledPayments")));
    } finally {
      setLoading(false);
    }
  }, [i18n]);

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
            message: getUserFacingErrorMessage(error, i18n("couldnTStopThisSchedule"))
          }
        }));
      }
    },
    [activeWallet, i18n, loadTokens]
  );

  const connected = Boolean(activeAddress) && !isDemoWallet;
  const renderValidityWindow = getValidityWindow(renderNowMs);

  return (
    <div className="container flex flex-1 flex-col py-3 md:py-4">
      <Card className="w-full">
        <CardHeader className="pb-3">
          <div className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div>
              <CardTitle>{i18n("scheduledPaymentsToYou")}</CardTitle>
              <CardDescription>
                {i18n("seeWhatIsAccruingToThisWalletStopping")}
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
        <CardContent className="space-y-4">
          {!connected ? (
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {isDemoWallet
                  ? i18n("theDemoIsReadOnlyConnectABrowser")
                  : i18n("connectABrowserWalletFromTheTopRight")}
              </span>
            </div>
          ) : loading ? (
            <div
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {i18n("lookingForPaymentsScheduledToYou")}
            </div>
          ) : loadError ? (
            <p role="alert" className="text-sm text-rose-300">{loadError}</p>
          ) : myPayments.length === 0 ? (
            <div role="status" className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
              <CircleSlash className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{i18n("noOneHasScheduledAPaymentToThis")}</span>
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
                          <span className="font-medium">
                            {formatAmountPerDay(
                              payment,
                              (value) => format.number(value),
                              (amount, asset) => i18n("amountPerDay", { amount, asset })
                            )}
                          </span>
                          {alreadyEnded ? (
                            <Badge variant="outline">{i18n("ended")}</Badge>
                          ) : cooldownBlocked ? (
                            <Badge variant="outline">{i18n("waitingPeriod")}</Badge>
                          ) : (
                            <Badge variant="secondary">{i18n("active")}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {i18n("accruesFromTo", {
                            start: format.dateTime(payment.startDate, "short"),
                            end: format.dateTime(payment.endDate, "short")
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {i18n("paidSoFarForSchedule", {
                            amount: formatPaidAmount(
                              payment,
                              (value) => format.number(value),
                              (amount, asset) => i18n("amount", { amount, asset })
                            ),
                            id: payment.streamingPaymentId
                          })}
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
                          {done
                            ? i18n("futurePaymentsStopped")
                            : submitting
                              ? i18n("stopping")
                              : i18n("stopFuturePayments")}
                        </Button>
                        {state.status === "error" ? (
                          <span role="alert" className="max-w-xs text-right text-xs text-rose-300">
                            {state.message}
                          </span>
                        ) : null}
                        {cooldownBlocked && state.status !== "error" ? (
                          <span className="max-w-xs text-right text-xs text-muted-foreground">
                            {i18n("scheduleChangedTryAfter", {
                              date: format.dateTime(renderNowMs + cooldownRemainingMs, "short")
                            })}
                          </span>
                        ) : null}
                        {!alreadyEnded && !cooldownBlocked && cannotShorten ? (
                          <span className="max-w-xs text-right text-xs text-muted-foreground">
                            {i18n("thisScheduleWillEndBeforeAStopRequest")}
                          </span>
                        ) : null}
                        {state.status === "done" ? (
                          <span role="status" className="text-right text-xs text-emerald-300">
                            {i18n("stopRequestSubmitted", { hash: state.txHash.slice(0, 10) })}
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
