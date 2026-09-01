"use client";
import { useTranslations } from "next-intl";

import { wealthSeriesForAssetAtom } from "@/components/user/workspace/atoms/workspace-transfer-derivations.atoms";
import { recentWalletActivityEventsAtom, walletTransactionsAtom } from "@/components/user/workspace/atoms/workspace-activity.atoms";
import { selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { activeInferredSttStateFormAtom, lockingContractAtom, totalLockedContractAssetsAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { lockedContractUtxosAtom, lockedContractUtxosErrorAtom, lockedContractUtxosLoadingAtom, walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";

import {
  AlarmClock,
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
import { SkeletonCard } from "@/components/ui/skeleton";
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
import { describeProofOfLife } from "@/lib/user-flow/proof-of-life";
import { DisclosureSection } from "@/components/user/workspace/editors";
import { buildCardanoscanAddressUrl, buildCardanoscanTransactionUrl, formatWalletTransactionRelative, formatWalletTransactionTime, getAssetQuantityByUnit } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useAtomValue } from "jotai";
import { lazy, Suspense, useEffect, useState } from "react";
import { copyFeedbackAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";

const WorkspaceTransactionsView = lazy(() =>
  import("@/components/user/workspace/workspace-transactions-view").then((module) => ({
    default: module.WorkspaceTransactionsView
  }))
);

/**
 * One row of the "Advanced wallet details" grid.
 *
 * The three rows used to be three hand-written blocks with three different shapes: the
 * address had a hint, a link, a second link on the value, and a copy button; the wallet id
 * had a link and nothing else; the token id had a bare `Token ID:` prefix and no way to get
 * the value out at all. The disclosure says these are for "support, exports, or
 * block-explorer lookups", and all three of those start by copying the value, so all three
 * rows now offer the same two actions and the value is plain text rather than a 64-character
 * link target.
 */
export function TechnicalDetail({
  className,
  title,
  hint,
  value,
  href,
  copyLabel,
  copyFeedback,
  onCopy
}: {
  className?: string;
  title: string;
  hint: string;
  /** `null` while the contract address has not resolved; the row says so rather than lying. */
  value: string | null;
  href: string | null;
  copyLabel: string;
  copyFeedback: string | null;
  onCopy: (value: string, successLabel: string) => Promise<void>;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceWalletDashboardView");
  const copied = copyFeedback === copyLabel;

  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground",
        className
      )}
    >
      <span className="block font-medium text-foreground/90">{title}</span>
      <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{hint}</span>
      {value ? (
        <span className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 break-all font-mono text-foreground">{value}</span>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground transition-colors hover:text-foreground"
              title={i18n("openTitleOnCardanoscan", { title: title })}
              aria-label={i18n("openTitleOnCardanoscan", { title: title })}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => void onCopy(value, copyLabel)}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground transition-colors hover:text-foreground"
            title={copied ? i18n("titleCopied", { title: title }) : i18n("copyTitle", { title: title })}
            aria-label={copied ? i18n("titleCopied", { title: title }) : i18n("copyTitle", { title: title })}
          >
            {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </span>
      ) : (
        <span className="mt-2 block font-mono text-foreground">{i18n("unavailable")}</span>
      )}
    </div>
  );
}

export function WorkspaceWalletDashboardView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceWalletDashboardView");
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
  // Ticks, rather than freezing at mount. This clock drives the proof of life tile, whose
  // whole job is to show a deadline approaching, so a countdown captured once kept reading
  // "< 1 hour" after the hour had passed and recovery contacts could already claim the
  // wallet. 30s matches the same ticker on `/payee`; the tile's smallest unit is an hour.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const {
    copyTextToClipboard,
    openAssetDetail,
    openGuidedOverview,
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
                        {i18n("balancePeopleAndRecentActivityAtAGlance")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="relative z-10 space-y-4">
                      <WalletHeroCard
                        walletName={
                          selectedDetectedToken
                            ? normalizeWalletName(activeInferredSttStateForm.walletName) || "Smart wallet"
                            : "Smart wallet"
                        }
                        identitySeed={
                          selectedDetectedToken?.utxo.input.txHash
                            ? `${selectedDetectedToken.utxo.input.txHash}#${selectedDetectedToken.utxo.input.outputIndex}`
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
                              i18n("walletAddressCopied")
                            );
                          }
                        }}
                        addressCopied={copyFeedback === "Wallet address copied"}
                        onSend={() => openWorkspaceIntent("send", "use")}
                        onReceive={() => openWorkspaceIntent("add-funds", "lock-funds")}
                        onActivity={() => openGuidedOverview("transactions")}
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
                        emptyHint={i18n("sendAdaToThisSmartWalletSAddress")}
                        onAssetClick={(unit) => openAssetDetail(unit)}
                        getSparkSeries={(unit) => {
                          const series = wealthSeriesForAsset(unit);
                          return series.length >= 2 ? series.map((p) => p.value) : null;
                        }}
                        emptyCta={{
                          label: i18n("addFunds"),
                          onClick: () => openWorkspaceIntent("add-funds", "lock-funds")
                        }}
                      />

                      {(() => {
                        const ownerCount = countAdminUsersInStateForm(activeInferredSttStateForm);
                        const backupCount = activeInferredSttStateForm.beneficiaries.length;
                        const scheduleCount = activeInferredSttStateForm.streamingPayments.length;
                        const timer = describeProofOfLife(activeInferredSttStateForm, nowMs);
                        // `onClick` is part of the row contract: these read as buttons, and
                        // without a handler on the type it is easy to ship one that is only
                        // decoration. `value` is a string rather than a count because the
                        // timer's headline is a duration, not a number of things; `null`
                        // selects the empty branch for every row alike.
                        const peopleRules: Array<{
                          id: string;
                          icon: LucideIcon;
                          value: string | null;
                          label: string;
                          emptyValue: string;
                          emptyLabel: string;
                          cta: string;
                          urgent?: boolean;
                          onClick: () => void;
                        }> = [
                          {
                            id: "owners",
                            icon: ShieldUser,
                            value: ownerCount === 0 ? null : String(ownerCount),
                            label: ownerCount === 1 ? i18n("owner") : i18n("owners"),
                            emptyValue: "0",
                            emptyLabel: i18n("owners"),
                            cta: i18n("manageOwners"),
                            onClick: () =>
                              openWorkspaceIntent("manage-people", "update-state", "people-admins-signers")
                          },
                          {
                            id: "backups",
                            icon: HandHeart,
                            value: backupCount === 0 ? null : String(backupCount),
                            label: backupCount === 1 ? i18n("recoveryContact") : i18n("recoveryContacts"),
                            emptyValue: "0",
                            emptyLabel: i18n("recoveryContacts"),
                            cta: backupCount === 0 ? i18n("addRecoveryContact") : i18n("manageRecoveryContacts"),
                            onClick: () =>
                              openWorkspaceIntent("wallet-settings", "update-state", "settings-beneficiaries")
                          },
                          {
                            id: "schedules",
                            icon: Repeat,
                            value: scheduleCount === 0 ? null : String(scheduleCount),
                            label:
                              scheduleCount === 1 ? i18n("scheduledPayment") : i18n("scheduledPayments"),
                            emptyValue: "0",
                            emptyLabel: i18n("scheduledPayments"),
                            cta:
                              scheduleCount === 0
                                ? i18n("addAScheduledPayment")
                                : i18n("manageScheduledPayments"),
                            onClick: () =>
                              openWorkspaceIntent(
                                "manage-streaming-payments",
                                "manage-streaming-payments",
                                scheduleCount === 0
                                  ? "streaming-payments-add"
                                  : "streaming-payments-edit-renew"
                              )
                          },
                          {
                            id: "proof-of-life",
                            icon: AlarmClock,
                            value: timer.value,
                            label: timer.label,
                            emptyValue: "Off",
                            emptyLabel: timer.emptyLabel,
                            cta: timer.cta,
                            urgent: timer.urgent,
                            onClick: () =>
                              openWorkspaceIntent(
                                "wallet-settings",
                                "update-state",
                                "settings-proof-of-life"
                              )
                          }
                        ];
                        return (
                          <div className="flex flex-wrap items-stretch gap-x-6 gap-y-3 rounded-lg border border-border/60 bg-background/35 p-3 sm:p-4">
                            {peopleRules.map((row, index) => {
                              const Icon = row.icon;
                              const empty = row.value === null;
                              // A count is one or two characters; "left on the timer" is
                              // not. Sizing off the shape of the value keeps the row from
                              // wrapping without giving every row a styling knob.
                              const numeric = row.value !== null && /^\d+$/.test(row.value);
                              return (
                                <div
                                  key={`${row.id}-${row.value ?? "empty"}`}
                                  className="tile-bump flex min-w-[160px] flex-1 items-baseline gap-3"
                                  style={{ animationDelay: `${index * 70}ms` }}
                                >
                                  <Icon
                                    className={cn(
                                      "h-4 w-4 shrink-0 translate-y-[3px]",
                                      empty
                                        ? "text-muted-foreground/70"
                                        : row.urgent
                                          ? "text-amber-400"
                                          : "text-primary"
                                    )}
                                    aria-hidden="true"
                                  />
                                  <div className="min-w-0">
                                    {empty ? (
                                      <>
                                        <p className="flex items-baseline gap-1.5">
                                          <span
                                            className={cn(
                                              "font-display font-medium tabular-nums leading-none tracking-[-0.02em] text-muted-foreground/70",
                                              /^\d+$/.test(row.emptyValue) ? "text-2xl" : "text-lg"
                                            )}
                                          >
                                            {row.emptyValue}
                                          </span>
                                          <span className="text-xs leading-none text-muted-foreground/70">
                                            {row.emptyLabel}
                                          </span>
                                        </p>
                                        <button
                                          type="button"
                                          onClick={row.onClick}
                                          className="mt-2 inline-flex items-center gap-1 rounded-full border border-dashed border-border/60 px-2 py-0.5 text-xs font-medium text-foreground/90 transition-[color,background-color,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                        >
                                          <Plus className="h-3 w-3" aria-hidden="true" />
                                          {row.cta}
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <p className="flex items-baseline gap-1.5">
                                          <span
                                            className={cn(
                                              "font-display font-medium tabular-nums leading-none tracking-[-0.02em]",
                                              numeric ? "text-2xl" : "text-lg",
                                              row.urgent ? "text-amber-300" : "text-foreground"
                                            )}
                                          >
                                            {row.value}
                                          </span>
                                          {row.label ? (
                                            <span className="text-xs leading-none text-muted-foreground">
                                              {row.label}
                                            </span>
                                          ) : null}
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
                        <FadeContent className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
                          {(selectedPermissionWalletCard?.roleBadges ?? []).length > 0 ? (
                            <div className="mb-3 flex flex-wrap gap-2">
                              {(selectedPermissionWalletCard?.roleBadges ?? []).map((badge) => (
                                <Badge key={`selected-role-${badge}`} variant="outline">
                                  {badge}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                          <p className="text-sm text-foreground">
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
                            // Not the slot: it is a chain counter the reader cannot read as a
                            // time, and this line is where a time goes. The slot survives in
                            // the tooltip below, which is the only place it is any use.
                            timestampDisplay:
                              relativeLabel ?? timestampLabel ?? "Time not available",
                            timestampTooltip: timestampLabel
                              ? `${timestampLabel} UTC · Slot ${tx.slot}`
                              : `Slot ${tx.slot}`
                          };
                        })}
                        loading={walletTransactions.loading}
                        onSeeAll={() => openGuidedOverview("transactions")}
                        onEventClick={() => openGuidedOverview("transactions")}
                      />

                      <DisclosureSection
                        title={i18n("advancedWalletDetails")}
                        description={i18n("technicalIdsAndAddressesOnlyNeededForSupport")}
                      >
                        <div className="grid min-w-0 gap-3 md:grid-cols-2">
                          <TechnicalDetail
                            className="md:col-span-2"
                            title={i18n("walletAddress")}
                            hint={i18n("shareThisAddressToReceiveFundsSentAda")}
                            value={lockingContract.address}
                            href={
                              lockingContract.address
                                ? buildCardanoscanAddressUrl(lockingContract.address)
                                : null
                            }
                            copyLabel={i18n("walletAddressCopied")}
                            copyFeedback={copyFeedback}
                            onCopy={copyTextToClipboard}
                          />
                          <TechnicalDetail
                            title={i18n("walletId")}
                            hint={i18n("namesThisWalletOnTheChainItIs")}
                            value={`${selectedDetectedToken.utxo.input.txHash}#${selectedDetectedToken.utxo.input.outputIndex}`}
                            href={buildCardanoscanTransactionUrl(
                              selectedDetectedToken.utxo.input.txHash
                            )}
                            copyLabel={i18n("walletIdCopied")}
                            copyFeedback={copyFeedback}
                            onCopy={copyTextToClipboard}
                          />
                          <TechnicalDetail
                            title={i18n("tokenId")}
                            hint={i18n("theNameOfThisWalletSOnChain")}
                            value={selectedDetectedToken.assetNameHex}
                            href={null}
                            copyLabel={i18n("tokenIdCopied")}
                            copyFeedback={copyFeedback}
                            onCopy={copyTextToClipboard}
                          />
                        </div>
                      </DisclosureSection>
                    </CardContent>
                  </Card>
                ) : (
                  <Suspense
                    fallback={
                      <div
                        className="min-h-[min(320px,45vh)]"
                        role="status"
                        aria-busy="true"
                        aria-live="polite"
                      >
                        <span className="sr-only">{i18n("loadingActivity")}</span>
                        <SkeletonCard />
                      </div>
                    }
                  >
                    <WorkspaceTransactionsView />
                  </Suspense>
                )}
                </div>
  );
}
