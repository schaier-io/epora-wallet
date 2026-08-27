"use client";
import { useFormatter, useTranslations } from "next-intl";

import {
  ArrowUpDown,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Settings2
} from "lucide-react";

import { CardSilkBackground } from "@/components/user/card-silk-background";
import { WealthChart } from "@/components/user/wealth-chart";
import { WalletIdentityOrb } from "@/components/user/wallet-hero-card";

import {
  AnimatedList
} from "@/components/react-bits/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

import {
  formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";

import { cn } from "@/lib/utils/cn";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { WALLET_ACTIVITY_PAGE_SIZE } from "@/components/user/workspace/constants";
import { ActivityUtxoList } from "@/components/user/workspace/editors";
import { buildCardanoscanTransactionUrl, formatCompactHash, formatWalletTransactionRelative, formatWalletTransactionTime } from "@/components/user/workspace/helpers";

import { useWorkspaceActivityState } from "@/components/user/workspace/use-workspace-activity-state";

export function WorkspaceTransactionsView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceTransactionsView");
  const format = useFormatter();
  const {
    wealthSeries,
    wealthSeriesForAsset,
    walletTransactions,
    recentWalletActivityEvents,
    activityPageCount,
    normalizedActivityPageIndex,
    paginatedWalletActivityEvents,
    activityVisibleStart,
    activityVisibleEnd,
    activityRangeLabel,
    copyFeedback,
    activeAddress,
    lockingContract,
    selectedDetectedToken,
    assetDetailUnit,
    setAssetDetailUnit,
    copyTextToClipboard,
    openWorkspaceIntent,
    refreshWalletTransactions,
    setActivityPageIndex,
  } = useWorkspaceActivityState();

  if (!selectedDetectedToken) {
    return null;
  }

  return (
                  <Card className="user-surface relative overflow-hidden">
                    <CardSilkBackground section="activity" />
                    <CardHeader className="relative z-10 pb-3">
                      <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <CardTitle className="flex items-center gap-2">
                            <ArrowUpDown className="h-4 w-4 text-primary" />
                            {i18n("activity")}
                          </CardTitle>
                          <CardDescription>
                            {i18n("everyConfirmedDepositSendAndWalletChange")}
                          </CardDescription>
                        </div>
                        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <Badge variant="outline">
                            {activityRangeLabel}
                          </Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void refreshWalletTransactions();
                            }}
                            disabled={walletTransactions.loading}
                          >
                            <RefreshCw
                              className={cn(
                                "h-4 w-4 transition-transform",
                                walletTransactions.loading && "animate-spin"
                              )}
                            />
                            {i18n("refresh")}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="relative z-10 space-y-5">
                      {!lockingContract.address ? (
                        <div className="flex min-h-[min(360px,50vh)] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/70 bg-muted/10 px-6 py-10 text-center">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background/60 shadow-sm">
                            <Settings2 className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                          </div>
                          <div className="max-w-sm space-y-2">
                            <p className="text-sm font-semibold text-foreground">
                              {i18n("prepareTheReceiveAddressFirst")}
                            </p>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {lockingContract.error ?? i18n("theReceiveAddressIsUnavailable")}
                            </p>
                          </div>
                        </div>
                      ) : null}

                      {lockingContract.address && assetDetailUnit ? (
                        (() => {
                          const identity = resolveAssetIdentity(assetDetailUnit);
                          const isAda = assetDetailUnit === "lovelace";
                          const assetSeries = wealthSeriesForAsset(assetDetailUnit);
                          const currentValue =
                            assetSeries.length > 0
                              ? assetSeries[assetSeries.length - 1]?.value ?? 0
                              : 0;
                          const firstValue = assetSeries[0]?.value ?? currentValue;
                          const delta = currentValue - firstValue;
                          const deltaPct =
                            firstValue !== 0 ? (delta / Math.abs(firstValue)) * 100 : 0;
                          const high = assetSeries.length
                            ? Math.max(...assetSeries.map((p) => p.value))
                            : currentValue;
                          const low = assetSeries.length
                            ? Math.min(...assetSeries.map((p) => p.value))
                            : currentValue;
                          const trendUp = delta >= 0;
                          const formatVal = (value: number) =>
                            format.number(value, {
                              minimumFractionDigits: isAda ? 2 : 0,
                              maximumFractionDigits: isAda ? 6 : 6
                            });
                          return (
                            <div className="space-y-3">
                              <button
                                type="button"
                                onClick={() => setAssetDetailUnit(null)}
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
                              >
                                <ChevronRight className="h-3 w-3 rotate-180" aria-hidden="true" />
                                {i18n("backToWalletBalance")}
                              </button>
                              {/* Asset summary card */}
                              <div
                                className="relative overflow-hidden rounded-xl border border-border/60 bg-background/45 p-4 animate-[section-fade-in_360ms_cubic-bezier(0.22,1,0.36,1)_both]"
                                aria-label={i18n("value1Summary", {
                                  value1: isAda ? "ADA" : identity.symbol
                                })}
                              >
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <WalletIdentityOrb
                                      seed={assetDetailUnit}
                                      size={40}
                                      initial={isAda ? "₳" : identity.symbol}
                                    />
                                    <div className="min-w-0">
                                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                        {isAda ? i18n("nativeAsset") : identity.knownMeta?.name ?? i18n("token")}
                                      </p>
                                      <p className="truncate text-base font-semibold text-foreground">
                                        {isAda ? i18n("ada") : identity.symbol}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-start sm:items-end">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                      {i18n("balance")}
                                    </p>
                                    <p className="font-display text-2xl font-medium tracking-[-0.02em] tabular-nums text-foreground">
                                      {formatVal(currentValue)}{" "}
                                      <span className="font-display text-sm font-medium italic text-muted-foreground">
                                        {isAda ? "₳" : identity.symbol}
                                      </span>
                                    </p>
                                  </div>
                                </div>
                                {assetSeries.length >= 2 ? (
                                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/40 pt-3 text-xs">
                                    <div>
                                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                        {i18n("change")}
                                      </p>
                                      <p
                                        className={cn(
                                          "mt-0.5 font-semibold tabular-nums",
                                          trendUp ? "text-emerald-300" : "text-rose-300"
                                        )}
                                      >
                                        {trendUp ? "+" : "−"}
                                        {formatVal(Math.abs(delta))}
                                        <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                                          ({trendUp ? "+" : "−"}
                                          {Math.abs(deltaPct).toFixed(1)}%)
                                        </span>
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                        {i18n("high")}
                                      </p>
                                      <p className="mt-0.5 font-semibold tabular-nums text-foreground">
                                        {formatVal(high)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                        {i18n("low")}
                                      </p>
                                      <p className="mt-0.5 font-semibold tabular-nums text-foreground">
                                        {formatVal(low)}
                                      </p>
                                    </div>
                                  </div>
                                ) : null}
                                <div className="mt-4 flex flex-wrap gap-2 border-t border-border/40 pt-3">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => openWorkspaceIntent("send", "use")}
                                    className="h-8 px-3 text-xs"
                                  >
                                    <Send className="h-3.5 w-3.5" />
                                    {i18n("send")} {isAda ? i18n("ada") : identity.symbol}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openWorkspaceIntent("add-funds", "lock-funds")}
                                    className="h-8 px-3 text-xs"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    {i18n("receive")}
                                  </Button>
                                </div>
                              </div>
                              <WealthChart
                                series={assetSeries}
                                unitLabel={isAda ? "₳" : identity.symbol}
                                formatValue={formatVal}
                                title={isAda ? i18n("adaBalance") : i18n("value1Balance", { value1: identity.symbol })}
                              />
                            </div>
                          );
                        })()
                      ) : lockingContract.address && wealthSeries.length > 0 ? (
                        <WealthChart
                          series={wealthSeries}
                          unitLabel="₳"
                          formatValue={(value) =>
                            format.number(value, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })
                          }
                          title={i18n("walletBalance")}
                        />
                      ) : null}

                      {walletTransactions.error ? (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                          {walletTransactions.error}
                        </div>
                      ) : null}

                      {lockingContract.address &&
                      !walletTransactions.error &&
                      walletTransactions.loading &&
                      recentWalletActivityEvents.length === 0 ? (
                        <div
                          className="flex min-h-[min(280px,45vh)] flex-col items-center justify-center gap-3 rounded-2xl border border-border/50 bg-muted/5 px-6 py-12"
                          aria-live="polite"
                          aria-busy="true"
                        >
                          <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden="true" />
                          <p className="text-sm font-medium text-foreground">{i18n("loadingActivity")}</p>
                          <p className="max-w-xs text-center text-xs text-muted-foreground">
                            {i18n("checkingThisSmartWalletOnPreprod")}
                          </p>
                        </div>
                      ) : null}

                      {lockingContract.address &&
                      !walletTransactions.error &&
                      !walletTransactions.loading &&
                      recentWalletActivityEvents.length === 0 ? (
                        <div className="flex min-h-[min(280px,45vh)] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/60 bg-muted/10 px-6 py-12 text-center">
                          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background/55 text-muted-foreground">
                            <ArrowUpDown className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div className="max-w-sm space-y-1.5">
                            <p className="text-sm font-semibold text-foreground">
                              {i18n("noWalletActivityYet")}
                            </p>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              {i18n("confirmedDepositsSendsAndRuleChangesWillAppear")}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openWorkspaceIntent("add-funds", "lock-funds")}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            {i18n("receiveFunds")}
                          </Button>
                        </div>
                      ) : null}

                      {lockingContract.address && recentWalletActivityEvents.length > 0 ? (
                        <AnimatedList className="space-y-2" stagger={45} distance={12} reveal="mount">
                          {paginatedWalletActivityEvents.map((activity) => {
                            const transaction = activity.transaction;
                            const timestampLabel = formatWalletTransactionTime(
                              transaction.blockTime
                            );
                            const relativeLabel = formatWalletTransactionRelative(
                              transaction.blockTime
                            );
                            const timestampDisplay = relativeLabel ?? timestampLabel ?? `Slot ${transaction.slot}`;
                            const timestampTooltip = timestampLabel
                              ? i18n("timestamplabelUtcSlotValue2", { timestampLabel: timestampLabel, value2: transaction.slot })
                              : i18n("slotValue1", { value1: transaction.slot });
                            const cardanoscanUrl = buildCardanoscanTransactionUrl(transaction.hash);
                            const txCopyFeedbackLabel = i18n("txHashCopiedValue1", { value1: transaction.hash });

                            return (
                              <details
                                key={activity.id}
                                className="group rounded-lg border border-border/60 bg-background/40 transition-[background-color,border-color,box-shadow] duration-200 open:border-emerald-400/25 open:bg-background/55 open:shadow-[0_18px_44px_-36px_rgba(45,212,191,0.55)]"
                              >
                                <summary className="list-none cursor-pointer p-3 [&::-webkit-details-marker]:hidden">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex min-w-0 flex-1 items-start gap-3">
                                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/55 text-muted-foreground transition-colors group-open:border-emerald-400/25 group-open:text-emerald-100">
                                        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-open:rotate-90" />
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                          <Badge
                                            variant="outline"
                                            className={cn("shrink-0", activity.badgeClassName)}
                                          >
                                            {activity.label}
                                          </Badge>
                                          <p className="text-sm font-semibold text-foreground">
                                            {activity.title}
                                          </p>
                                          <span
                                            className="text-[11px] text-muted-foreground"
                                            title={timestampTooltip}
                                          >
                                            {timestampDisplay}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                          {activity.summary}
                                        </p>
                                        <p className="mt-2 text-[11px] text-muted-foreground">
                                          {i18n("triggeredBy")}{" "}
                                          <span className="text-foreground/90">
                                            {activity.actorLabel}
                                          </span>
                                          {activity.actorDetail ? (
                                            <span className="font-mono">
                                              {" "}
                                              ({activity.actorDetail})
                                            </span>
                                          ) : null}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex min-w-0 shrink-0 flex-row items-center justify-between gap-3 sm:flex-col sm:items-end">
                                      <p
                                        className={cn(
                                          "text-sm font-semibold",
                                          activity.amountClassName
                                        )}
                                      >
                                        {activity.amountSummary}
                                      </p>
                                      <a
                                        href={cardanoscanUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="max-w-[11rem] truncate font-mono text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                                        title={i18n("openTransactionOnCardanoscan")}
                                      >
                                        {formatCompactHash(transaction.hash)}
                                      </a>
                                    </div>
                                  </div>
                                </summary>
                                <div className="space-y-3 border-t border-border/50 p-3 pt-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-foreground">
                                        {i18n("transactionDetails")}
                                      </p>
                                      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                                        {transaction.hash}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                      <a
                                        href={cardanoscanUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground transition-colors hover:text-foreground"
                                        title={i18n("openOnCardanoscan")}
                                        aria-label={i18n("openTransactionOnCardanoscan")}
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void copyTextToClipboard(
                                            transaction.hash,
                                            txCopyFeedbackLabel
                                          )
                                        }
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground transition-colors hover:text-foreground"
                                        title={
                                          copyFeedback === txCopyFeedbackLabel
                                            ? i18n("transactionHashCopied")
                                            : i18n("copyTransactionHash")
                                        }
                                        aria-label={
                                          copyFeedback === txCopyFeedbackLabel
                                            ? i18n("transactionHashCopied")
                                            : i18n("copyTransactionHash")
                                        }
                                      >
                                        {copyFeedback === txCopyFeedbackLabel ? (
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                        ) : (
                                          <Copy className="h-3.5 w-3.5" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                    {activity.details.map((detail) => (
                                      <div
                                        key={`${activity.id}-${detail.label}`}
                                        className="rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                                      >
                                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                          {detail.label}
                                        </p>
                                        <p className="mt-1 text-xs text-foreground">
                                          {detail.value}
                                        </p>
                                      </div>
                                    ))}
                                    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                        {i18n("fee")}
                                      </p>
                                      <p className="mt-1 text-xs text-foreground">
                                        {formatLovelaceAsAda(transaction.fees ?? "0")} {i18n("ada")}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                        {i18n("slot")}
                                      </p>
                                      <p className="mt-1 text-xs text-foreground">
                                        {transaction.slot}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="grid gap-3 xl:grid-cols-2">
                                    <ActivityUtxoList
                                      title={i18n("sourcesUsed")}
                                      utxos={activity.inputUtxos}
                                      walletAddress={lockingContract.address}
                                      activeAddress={activeAddress}
                                      sttUnit={selectedDetectedToken?.unit ?? null}
                                      emptyLabel={i18n("noSourceDetails")}
                                    />
                                    <ActivityUtxoList
                                      title={i18n("destinationsCreated")}
                                      utxos={activity.outputUtxos}
                                      walletAddress={lockingContract.address}
                                      activeAddress={activeAddress}
                                      sttUnit={selectedDetectedToken?.unit ?? null}
                                      emptyLabel={i18n("noDestinationDetails")}
                                    />
                                  </div>
                                </div>
                              </details>
                            );
                          })}
                          {recentWalletActivityEvents.length > WALLET_ACTIVITY_PAGE_SIZE ? (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/30 px-3 py-2">
                              <p className="text-xs text-muted-foreground">
                                {i18n("showingRange", {
                                  start: activityVisibleStart,
                                  end: activityVisibleEnd,
                                  total: recentWalletActivityEvents.length
                                })}
                              </p>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() =>
                                    setActivityPageIndex(
                                      Math.max(normalizedActivityPageIndex - 1, 0)
                                    )
                                  }
                                  disabled={normalizedActivityPageIndex === 0}
                                >
                                  {i18n("previous")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() =>
                                    setActivityPageIndex(
                                      Math.min(
                                        normalizedActivityPageIndex + 1,
                                        activityPageCount - 1
                                      )
                                    )
                                  }
                                  disabled={normalizedActivityPageIndex >= activityPageCount - 1}
                                >
                                  {i18n("next")}
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </AnimatedList>
                      ) : null}

                    </CardContent>
                  </Card>
  );
}
