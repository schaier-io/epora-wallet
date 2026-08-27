"use client";
import { useTranslations } from "next-intl";

import { wealthSeriesForAssetAtom } from "@/components/user/workspace/atoms/workspace-transfer-derivations.atoms";
import { recentWalletActivityEventsAtom, walletTransactionsAtom } from "@/components/user/workspace/atoms/workspace-activity.atoms";
import { selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { activeInferredSttStateFormAtom, lockingContractAtom, totalLockedContractAssetsAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { lockedContractUtxosAtom, lockedContractUtxosErrorAtom, lockedContractUtxosLoadingAtom, walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";

import {
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  HandHeart,
  House,
  Plus,
  Repeat,
  ShieldUser,
  type LucideIcon
} from "lucide-react";

import { CardSilkBackground } from "@/components/user/card-silk-background";
import { WalletHeroCard } from "@/components/user/wallet-hero-card";
import { LockedAssetsOverviewPanel } from "@/components/user/locked-assets-panel";
import { RecentActivityTimeline } from "@/components/user/recent-activity-timeline";

import {
  FadeContent
} from "@/components/react-bits/primitives";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  countAdminUsersInStateForm
} from "@/lib/contracts/state-form";
import {
  normalizeWalletName } from "@/lib/contracts/state-wallet-name";

import { cn } from "@/lib/utils/cn";
import { DisclosureSection } from "@/components/user/workspace/editors";
import { buildCardanoscanAddressUrl, buildCardanoscanTransactionUrl, formatWalletTransactionRelative, formatWalletTransactionTime, getAssetQuantityByUnit } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { WorkspaceTransactionsView } from "@/components/user/workspace/workspace-transactions-view";
import { useSetAtom, useAtomValue } from "jotai";
import { assetDetailUnitAtom, copyFeedbackAtom, guidedOverviewSectionAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";

export function WorkspaceWalletDashboardView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceWalletDashboardView");
  const walletAddressCopiedLabel = i18n("walletAddressCopied");
  const receiveAddressCopiedLabel = i18n("receiveAddressCopied");
  const state = useWorkspaceActions();
  const wealthSeriesForAsset = useAtomValue(wealthSeriesForAssetAtom);
  const walletTransactions = useAtomValue(walletTransactionsAtom);
  const recentWalletActivityEvents = useAtomValue(recentWalletActivityEventsAtom);
  const copyFeedback = useAtomValue(copyFeedbackAtom);
  const activeInferredSttStateForm = useAtomValue(activeInferredSttStateFormAtom);
  const lockingContract = useAtomValue(lockingContractAtom);
  const selectedDetectedToken = useAtomValue(selectedDetectedTokenAtom);
  const totalLockedContractAssets = useAtomValue(totalLockedContractAssetsAtom);
  const walletBalanceSummary = useAtomValue(walletBalanceSummaryAtom);
  const lockedContractUtxos = useAtomValue(lockedContractUtxosAtom);
  const lockedContractUtxosLoading = useAtomValue(lockedContractUtxosLoadingAtom);
  const lockedContractUtxosError = useAtomValue(lockedContractUtxosErrorAtom);
  const setAssetDetailUnit = useSetAtom(assetDetailUnitAtom);
  const setGuidedOverviewSection = useSetAtom(guidedOverviewSectionAtom);
  const {
    copyTextToClipboard,
    openWorkspaceIntent,
    selectedPermissionWalletCard,
    resolvedGuidedOverviewSection,
  } = state;

  if (!selectedDetectedToken) {
    return null;
  }

  return (
                <div key={`section-${resolvedGuidedOverviewSection}`} className="section-transition">
                {resolvedGuidedOverviewSection === "home" ? (
                  <Card className="user-surface relative overflow-hidden">
                    <CardSilkBackground section="home" />
                    <CardHeader className="relative z-10 pb-3">
                      <CardTitle className="flex items-center gap-2">
                        <House className="h-4 w-4 text-primary" />
                        {i18n("walletHome")}
                      </CardTitle>
                      <CardDescription>
                        {i18n("checkWhatTheWalletHoldsWhoCanAct")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="relative z-10 space-y-5">
                      <WalletHeroCard
                        walletName={
                          selectedDetectedToken
                            ? normalizeWalletName(activeInferredSttStateForm.walletName) || i18n("smartWallet")
                            : i18n("smartWallet")
                        }
                        identitySeed={
                          selectedDetectedToken?.utxo.input.txHash
                            ? i18n("value1Value2", { value1: selectedDetectedToken.utxo.input.txHash, value2: selectedDetectedToken.utxo.input.outputIndex })
                            : lockingContract.address
                        }
                        address={lockingContract.address}
                        balanceLovelace={getAssetQuantityByUnit(
                          totalLockedContractAssets,
                          "lovelace"
                        )}
                        assetTypeCount={totalLockedContractAssets.length}
                        fundingSourceCount={lockedContractUtxos.length}
                        loading={walletBalanceSummary.loading}
                        onCopyAddress={() => {
                          if (lockingContract.address) {
                            void copyTextToClipboard(
                              lockingContract.address,
                              walletAddressCopiedLabel
                            );
                          }
                        }}
                        addressCopied={copyFeedback === walletAddressCopiedLabel}
                        onSend={() => openWorkspaceIntent("send", "use")}
                        onReceive={() => openWorkspaceIntent("add-funds", "lock-funds")}
                        onActivity={() => setGuidedOverviewSection("transactions")}
                        onSettings={() =>
                          openWorkspaceIntent(
                            "wallet-settings",
                            "update-state",
                            "settings-wallet-name"
                          )
                        }
                      />
                      <LockedAssetsOverviewPanel
                        utxoCount={lockedContractUtxos.length}
                        assets={totalLockedContractAssets}
                        loadError={lockedContractUtxosError}
                        loading={lockedContractUtxosLoading}
                        emptyHint={i18n("thisWalletIsEmptyShareItsReceiveAddress")}
                        onAssetClick={(unit) => {
                          setAssetDetailUnit(unit);
                          setGuidedOverviewSection("transactions");
                        }}
                        getSparkSeries={(unit) => {
                          const series = wealthSeriesForAsset(unit);
                          return series.length >= 2 ? series.map((p) => p.value) : null;
                        }}
                        emptyCta={{
                          label: i18n("receiveFunds"),
                          onClick: () => openWorkspaceIntent("add-funds", "lock-funds")
                        }}
                      />

                      {(() => {
                        const ownerCount = countAdminUsersInStateForm(activeInferredSttStateForm);
                        const backupCount = activeInferredSttStateForm.beneficiaries.length;
                        const scheduleCount = activeInferredSttStateForm.streamingPayments.length;
                        const peopleRules: Array<{
                          id: string;
                          icon: LucideIcon;
                          count: number;
                          label: string;
                          cta: string;
                          onClick: () => void;
                        }> = [
                          {
                            id: "owners",
                            icon: ShieldUser,
                            count: ownerCount,
                            label: ownerCount === 1 ? i18n("owner") : i18n("owners"),
                            cta: i18n("manageOwners"),
                            onClick: () =>
                              openWorkspaceIntent(
                                "manage-people",
                                "update-state",
                                "people-admins-signers"
                              )
                          },
                          {
                            id: "backups",
                            icon: HandHeart,
                            count: backupCount,
                            label: backupCount === 1 ? i18n("recoveryContact") : i18n("recoveryContacts"),
                            cta: backupCount === 0 ? i18n("addRecoveryContact") : i18n("manageRecoveryContacts"),
                            onClick: () =>
                              openWorkspaceIntent(
                                "wallet-settings",
                                "update-state",
                                "settings-beneficiaries"
                              )
                          },
                          {
                            id: "schedules",
                            icon: Repeat,
                            count: scheduleCount,
                            label: scheduleCount === 1 ? i18n("schedule") : i18n("schedules"),
                            cta: scheduleCount === 0 ? i18n("createSchedule") : i18n("manageSchedules"),
                            onClick: () =>
                              openWorkspaceIntent(
                                "manage-streaming-payments",
                                "manage-streaming-payments",
                                scheduleCount === 0
                                  ? "streaming-payments-add"
                                  : "streaming-payments-edit-renew"
                              )
                          }
                        ];
                        return (
                          <div className="flex flex-wrap items-stretch gap-x-6 gap-y-3 rounded-lg border border-border/60 bg-background/35 px-4 py-4">
                            {peopleRules.map((row, index) => {
                              const Icon = row.icon;
                              const empty = row.count === 0;
                              return (
                                <div
                                  key={`${row.id}-${row.count}`}
                                  className="tile-bump flex min-w-[160px] flex-1 items-baseline gap-3"
                                  style={{ animationDelay: `${index * 70}ms` }}
                                >
                                  <Icon
                                    className={cn(
                                      "h-4 w-4 shrink-0 translate-y-[3px]",
                                      empty ? "text-muted-foreground/70" : "text-primary"
                                    )}
                                    aria-hidden="true"
                                  />
                                  <div className="min-w-0">
                                    {empty ? (
                                      <>
                                        <p className="flex items-baseline gap-1.5">
                                          <span className="text-2xl font-semibold tabular-nums leading-none text-muted-foreground/40">
                                            {i18n("notSet")}
                                          </span>
                                          <span className="text-xs leading-none text-muted-foreground/70">
                                            {i18n("no")} {row.label}
                                          </span>
                                        </p>
                                        <button
                                          type="button"
                                          onClick={row.onClick}
                                          className="mt-2 inline-flex items-center gap-1 rounded-full border border-dashed border-border/60 px-2 py-0.5 text-[11px] font-medium text-foreground/90 transition-[color,background-color,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                        >
                                          <Plus className="h-3 w-3" aria-hidden="true" />
                                          {row.cta}
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <p className="flex items-baseline gap-1.5">
                                          <span className="font-display text-2xl font-medium tabular-nums leading-none tracking-[-0.02em] text-foreground">
                                            {row.count}
                                          </span>
                                          <span className="text-xs leading-none text-muted-foreground">
                                            {row.label}
                                          </span>
                                        </p>
                                        <button
                                          type="button"
                                          onClick={row.onClick}
                                          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
                                        >
                                          {row.cta}
                                          <ChevronRight className="h-3 w-3" aria-hidden="true" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {selectedPermissionWalletCard?.warning ? (
                        <FadeContent className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                          <div className="flex flex-wrap gap-2">
                            {(selectedPermissionWalletCard?.roleBadges ?? []).map((badge) => (
                              <Badge key={`selected-role-${badge}`} variant="outline">
                                {badge}
                              </Badge>
                            ))}
                          </div>
                          <p className="mt-3 text-sm text-foreground">
                            {selectedPermissionWalletCard.warning}
                          </p>
                        </FadeContent>
                      ) : null}

                      <RecentActivityTimeline
                        events={recentWalletActivityEvents.slice(0, 5).map((activity) => {
                          const tx = activity.transaction;
                          const timestampLabel = formatWalletTransactionTime(tx.blockTime);
                          const relativeLabel = formatWalletTransactionRelative(tx.blockTime);
                          return {
                            id: activity.id,
                            title: activity.title,
                            label: activity.label,
                            badgeClassName: activity.badgeClassName,
                            amountSummary: activity.amountSummary,
                            amountClassName: activity.amountClassName,
                            timestampDisplay:
                              relativeLabel ?? timestampLabel ?? `Slot ${tx.slot}`,
                            timestampTooltip: timestampLabel
                              ? i18n("timestamplabelUtcSlotValue2", { timestampLabel: timestampLabel, value2: tx.slot })
                              : i18n("slotValue1", { value1: tx.slot })
                          };
                        })}
                        loading={walletTransactions.loading}
                        onSeeAll={() => setGuidedOverviewSection("transactions")}
                        onEventClick={() => setGuidedOverviewSection("transactions")}
                      />

                      <DisclosureSection
                        title={i18n("advancedWalletDetails")}
                        description={i18n("technicalIdsAndAddressesOnlyNeededForSupport")}
                      >
                        <div className="grid min-w-0 gap-3 md:grid-cols-2">
                          <div className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                            <span className="block font-medium text-foreground/90">{i18n("walletId")}</span>
                            <a
                              href={buildCardanoscanTransactionUrl(selectedDetectedToken.utxo.input.txHash)}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1 break-all font-mono text-foreground underline-offset-4 hover:underline"
                              title={i18n("viewTransactionOnCardanoscan")}
                            >
                              {selectedDetectedToken.utxo.input.txHash}#{selectedDetectedToken.utxo.input.outputIndex}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          </div>
                          <div className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                            <span className="block font-medium text-foreground/90">{i18n("receiveAddress")}</span>
                            <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                              {i18n("shareThisAddressToReceiveFundsSentAda")}
                            </span>
                            <span className="mt-2 block">
                            {lockingContract.address ? (
                              <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-2">
                                <a
                                  href={buildCardanoscanAddressUrl(lockingContract.address)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="min-w-0 break-all font-mono text-foreground underline-offset-4 hover:underline"
                                >
                                  {lockingContract.address}
                                </a>
                                <a
                                  href={buildCardanoscanAddressUrl(lockingContract.address)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground transition-colors hover:text-foreground"
                                  title={i18n("openAddressOnCardanoscan")}
                                  aria-label={i18n("openAddressOnCardanoscan")}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void copyTextToClipboard(
                                      lockingContract.address,
                                      receiveAddressCopiedLabel
                                    )
                                  }
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground transition-colors hover:text-foreground"
                                  title={
                                    copyFeedback === receiveAddressCopiedLabel
                                      ? i18n("addressCopied")
                                      : i18n("copyAddress")
                                  }
                                  aria-label={
                                    copyFeedback === receiveAddressCopiedLabel
                                      ? i18n("addressCopied")
                                      : i18n("copyAddress")
                                  }
                                >
                                  {copyFeedback === receiveAddressCopiedLabel ? (
                                    <CheckCircle2 className="h-3 w-3" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </span>
                            ) : (
                              <span className="font-mono text-foreground">{i18n("unavailable")}</span>
                            )}
                            </span>
                          </div>
                          <div className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                            {i18n("walletTokenAssetName")}{" "}
                            <span className="break-all font-mono text-foreground">
                              {selectedDetectedToken.assetNameHex}
                            </span>
                          </div>
                        </div>
                      </DisclosureSection>
                    </CardContent>
                  </Card>
                ) : (
                  <WorkspaceTransactionsView />
                )}
                </div>
  );
}
