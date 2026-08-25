"use client";
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
import { describeWakeUpTimer } from "@/lib/user-flow/wake-up-timer";
import { DisclosureSection } from "@/components/user/workspace/editors";
import { buildCardanoscanAddressUrl, buildCardanoscanTransactionUrl, formatWalletTransactionRelative, formatWalletTransactionTime, getAssetQuantityByUnit } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { WorkspaceTransactionsView } from "@/components/user/workspace/workspace-transactions-view";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { copyFeedbackAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";

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
              title={`Open ${title} on Cardanoscan`}
              aria-label={`Open ${title} on Cardanoscan`}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => void onCopy(value, copyLabel)}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground transition-colors hover:text-foreground"
            title={copied ? `${title} copied` : `Copy ${title}`}
            aria-label={copied ? `${title} copied` : `Copy ${title}`}
          >
            {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </span>
      ) : (
        <span className="mt-2 block font-mono text-foreground">Unavailable</span>
      )}
    </div>
  );
}

export function WorkspaceWalletDashboardView() {
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
  // The wake-up tile counts down, so it needs the clock. Reading it in a lazy initializer
  // rather than in render keeps the rendered output stable across re-renders: the value is
  // sampled once when this view mounts. Day-granularity means a sample that is minutes old
  // reads identically, and remounting on wallet switch re-samples it.
  const [nowMs] = useState(() => Date.now());
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
                        Wallet home
                      </CardTitle>
                      <CardDescription>
                        Balance, people, and recent activity at a glance.
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
                              "Wallet address copied"
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
                        emptyHint="Send ADA to this smart wallet's address. Funds appear here once the network confirms the transfer."
                        onAssetClick={(unit) => openAssetDetail(unit)}
                        getSparkSeries={(unit) => {
                          const series = wealthSeriesForAsset(unit);
                          return series.length >= 2 ? series.map((p) => p.value) : null;
                        }}
                        emptyCta={{
                          label: "Add funds",
                          onClick: () => openWorkspaceIntent("add-funds", "lock-funds")
                        }}
                      />

                      {(() => {
                        const ownerCount = countAdminUsersInStateForm(activeInferredSttStateForm);
                        const backupCount = activeInferredSttStateForm.beneficiaries.length;
                        const scheduleCount = activeInferredSttStateForm.streamingPayments.length;
                        const timer = describeWakeUpTimer(activeInferredSttStateForm, nowMs);
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
                            label: ownerCount === 1 ? "owner" : "owners",
                            emptyValue: "0",
                            emptyLabel: "owners",
                            cta: "Manage owners",
                            onClick: () =>
                              openWorkspaceIntent("manage-people", "update-state", "people-admins-signers")
                          },
                          {
                            id: "backups",
                            icon: HandHeart,
                            value: backupCount === 0 ? null : String(backupCount),
                            label: backupCount === 1 ? "recovery contact" : "recovery contacts",
                            emptyValue: "0",
                            emptyLabel: "recovery contacts",
                            cta: backupCount === 0 ? "Add recovery contact" : "Manage recovery contacts",
                            onClick: () =>
                              openWorkspaceIntent("wallet-settings", "update-state", "settings-beneficiaries")
                          },
                          {
                            id: "schedules",
                            icon: Repeat,
                            value: scheduleCount === 0 ? null : String(scheduleCount),
                            label:
                              scheduleCount === 1 ? "scheduled payment" : "scheduled payments",
                            emptyValue: "0",
                            emptyLabel: "scheduled payments",
                            cta:
                              scheduleCount === 0
                                ? "Add a scheduled payment"
                                : "Manage scheduled payments",
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
                            id: "wake-up-timer",
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
                            timestampDisplay:
                              relativeLabel ?? timestampLabel ?? `Slot ${tx.slot}`,
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
                        title="Advanced wallet details"
                        description="Technical IDs and addresses. Only needed for support, exports, or block-explorer lookups."
                      >
                        <div className="grid min-w-0 gap-3 md:grid-cols-2">
                          <TechnicalDetail
                            className="md:col-span-2"
                            title="Wallet address"
                            hint="Share this address to receive funds. Sent ADA arrives under this wallet's rules."
                            value={lockingContract.address}
                            href={
                              lockingContract.address
                                ? buildCardanoscanAddressUrl(lockingContract.address)
                                : null
                            }
                            copyLabel="Wallet address copied"
                            copyFeedback={copyFeedback}
                            onCopy={copyTextToClipboard}
                          />
                          <TechnicalDetail
                            title="Wallet ID"
                            hint="Names this wallet on the chain. It is also the transaction that created it."
                            value={`${selectedDetectedToken.utxo.input.txHash}#${selectedDetectedToken.utxo.input.outputIndex}`}
                            href={buildCardanoscanTransactionUrl(
                              selectedDetectedToken.utxo.input.txHash
                            )}
                            copyLabel="Wallet ID copied"
                            copyFeedback={copyFeedback}
                            onCopy={copyTextToClipboard}
                          />
                          <TechnicalDetail
                            title="Token ID"
                            hint="The name of this wallet's on-chain token. Support may ask for it."
                            value={selectedDetectedToken.assetNameHex}
                            href={null}
                            copyLabel="Token ID copied"
                            copyFeedback={copyFeedback}
                            onCopy={copyTextToClipboard}
                          />
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
