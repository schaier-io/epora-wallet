"use client";
import { useTranslations } from "next-intl";

import { recentWalletActivityEventsAtom, walletTransactionsAtom } from "@/components/user/workspace/atoms/workspace-activity.atoms";
import { orphanDiscoveryAssetNameHexAtom, orphanDiscoveryPolicyIdAtom, orphanDiscoveryWalletAddressAtom, selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { detectedSttTokensErrorAtom, detectedSttTokensLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { networkIdAtom } from "@/providers/wallet.atoms";
import { useAtomValue } from "jotai";

import {
  ArrowUpDown,
  ChevronRight,
  House
} from "lucide-react";

import { StakeAddressDiscoveryPanel } from "@/components/user/stake-address-discovery-panel";

import {
  AnimatedList,
  SpotlightCard
} from "@/components/react-bits/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { cn } from "@/lib/utils/cn";
import { SidebarActiveGlow } from "@/components/user/workspace/editors";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import {
  guidedSidebarActiveSurfaceClass,
  guidedSidebarIdleSurfaceClass,
  guidedSidebarIconBaseClass,
  guidedSidebarIconActiveClass,
  guidedSidebarIconIdleClass,
  guidedSidebarButtonClass,
  guidedSidebarTextClass,
  guidedSidebarTitleClass,
  guidedSidebarDescriptionClass,
  guidedSidebarChevronClass
} from "@/components/user/workspace/workspace-guided-sidebar-classes";
import { GuidedActionSectionView } from "@/components/user/workspace/workspace-guided-action-section-view";
import { GuidedAdminSectionView } from "@/components/user/workspace/workspace-guided-admin-section-view";

export function WorkspaceSidebarView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceSidebarView");
  const state = useWorkspaceActions();
  const walletTransactions = useAtomValue(walletTransactionsAtom);
  const recentWalletActivityEvents = useAtomValue(recentWalletActivityEventsAtom);
  const networkId = useAtomValue(networkIdAtom);
  const orphanDiscoveryAssetNameHex = useAtomValue(orphanDiscoveryAssetNameHexAtom);
  const orphanDiscoveryPolicyId = useAtomValue(orphanDiscoveryPolicyIdAtom);
  const orphanDiscoveryWalletAddress = useAtomValue(orphanDiscoveryWalletAddressAtom);
  const selectedDetectedToken = useAtomValue(selectedDetectedTokenAtom);
  const detectedSttTokensError = useAtomValue(detectedSttTokensErrorAtom);
  const detectedSttTokensLoading = useAtomValue(detectedSttTokensLoadingAtom);
  const walletIsResolving =
    !selectedDetectedToken && detectedSttTokensLoading && !detectedSttTokensError;
  const walletLookupFailed = !selectedDetectedToken && Boolean(detectedSttTokensError);
  const {
    dispatchWorkspaceAction,
    handleConsolidateOrphans,
    guidedEverydayActions,
    guidedAdminGroups,
    guidedToolActions,
    hasGuidedActivityContext,
    isGuidedHomeSelected,
    isGuidedTransactionsSelected,
    openGuidedOverview
  } = state;
  // Staking and rewards are ordinary tasks, so they sit with Send and Pay. `Advanced` keeps
  // the maintenance and governance tools (Tidy funds, Refresh timer, certificates, votes).
  const isEverydayTool = (intent: string) => intent === "enable-staking" || intent === "rewards";
  const everydayActions = [
    ...guidedEverydayActions,
    ...guidedToolActions.filter((entry) => isEverydayTool(entry.intent))
  ];
  const advancedActions = guidedToolActions.filter((entry) => !isEverydayTool(entry.intent));

  // Padding stays on the content here, not on the Card. The inner scroller below is
  // deliberately near-full-bleed so its scrollbar hugs the card edge; Card padding sits
  // outside that `overflow-hidden` box, which would move the track inward and break the
  // `scrollbar-gutter: stable` reservation in globals.css. Both `p-` and `sm:p-` have to be
  // cleared: tailwind-merge treats them as separate groups.
  return (
            <Card className="user-surface order-2 flex min-h-0 flex-col p-0 sm:p-0 lg:sticky lg:top-4 lg:order-1 lg:max-h-[calc(100dvh-1.5rem)] lg:self-start">
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
                {walletIsResolving ? (
                  <div role="status" aria-label={i18n("loadingYourWallet")} className="space-y-3">
                    <span className="sr-only">{i18n("loadingYourWallet")}</span>
                    <Skeleton className="h-4 w-24" aria-hidden="true" />
                    <Skeleton className="h-16 w-full rounded-lg" aria-hidden="true" />
                    <Skeleton className="h-16 w-full rounded-lg" aria-hidden="true" />
                    <Skeleton className="h-9 w-full rounded-md" aria-hidden="true" />
                  </div>
                ) : walletLookupFailed ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                    <p className="font-medium text-foreground">{i18n("walletCouldNotLoad")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{detectedSttTokensError}</p>
                  </div>
                ) : !selectedDetectedToken ? (
                  <div className="rounded-lg border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">{i18n("noWalletOpen")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {detectedSttTokensError ? i18n("couldNotLoadThisWalletReloadThePage") : i18n("theWalletInThisLinkIsNotOne")}
                    </p>
                  </div>
                ) : null}

                {selectedDetectedToken ? (
                  <div className="user-scrollbar min-h-0 overflow-x-clip overflow-y-auto px-1 pb-1 pr-2">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="eyebrow pt-1 font-medium text-muted-foreground/70">
                          {i18n("wallet")}
                        </p>
                        <AnimatedList
                          className="space-y-2"
                          itemClassName="w-full"
                          stagger={45}
                          distance={12}
                          reveal="mount"
                        >
                          <SpotlightCard
                            className="min-w-0 rounded-lg"
                            spotlightColor="rgba(82, 255, 220, 0.16)"
                          >
                            {isGuidedHomeSelected ? <SidebarActiveGlow /> : null}
                            <button
                              type="button"
                              onClick={() => openGuidedOverview("home")}
                              aria-current={isGuidedHomeSelected ? "true" : undefined}
                              className={cn(
                                guidedSidebarButtonClass,
                                isGuidedHomeSelected
                                  ? guidedSidebarActiveSurfaceClass
                                  : guidedSidebarIdleSurfaceClass
                              )}
                            >
                              <div className="flex min-w-0 flex-1 items-start gap-3 overflow-hidden">
                                <span
                                  className={cn(
                                    guidedSidebarIconBaseClass,
                                    isGuidedHomeSelected
                                      ? guidedSidebarIconActiveClass
                                      : guidedSidebarIconIdleClass
                                  )}
                                >
                                  <House className="h-4 w-4" />
                                </span>
                                <div className={guidedSidebarTextClass}>
                                  <p className={guidedSidebarTitleClass}>
                                    {i18n("home")}
                                  </p>
                                  <p className={guidedSidebarDescriptionClass}>
                                    {i18n("balancePeopleAndRecentActivity")}
                                  </p>
                                </div>
                              </div>
                              <ChevronRight
                                className={cn(
                                  guidedSidebarChevronClass,
                                  isGuidedHomeSelected
                                    ? "opacity-100 text-emerald-100"
                                    : "opacity-35 text-muted-foreground"
                                )}
                              />
                            </button>
                          </SpotlightCard>

                          {hasGuidedActivityContext ? (
                            <SpotlightCard
                              className="min-w-0 rounded-lg"
                              spotlightColor="rgba(82, 255, 220, 0.16)"
                            >
                              {isGuidedTransactionsSelected ? <SidebarActiveGlow /> : null}
                              <button
                                type="button"
                                onClick={() => openGuidedOverview("transactions")}
                                aria-current={isGuidedTransactionsSelected ? "true" : undefined}
                                className={cn(
                                  guidedSidebarButtonClass,
                                  isGuidedTransactionsSelected
                                    ? guidedSidebarActiveSurfaceClass
                                    : guidedSidebarIdleSurfaceClass
                                )}
                              >
                                <div className="flex min-w-0 flex-1 items-start gap-3 overflow-hidden">
                                  <span
                                    className={cn(
                                      guidedSidebarIconBaseClass,
                                      isGuidedTransactionsSelected
                                        ? guidedSidebarIconActiveClass
                                        : guidedSidebarIconIdleClass
                                    )}
                                  >
                                    <ArrowUpDown className="h-4 w-4" />
                                  </span>
                                  <div className={guidedSidebarTextClass}>
                                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                      <p className={guidedSidebarTitleClass}>
                                        {i18n("activity")}
                                      </p>
                                      <Badge
                                        variant={
                                          walletTransactions.loading ? "secondary" : "outline"
                                        }
                                        className="whitespace-nowrap"
                                      >
                                        {walletTransactions.loading
                                          ? i18n("refreshing")
                                          : i18n("value1", { value1: recentWalletActivityEvents.length })}
                                      </Badge>
                                    </div>
                                    <p className={guidedSidebarDescriptionClass}>
                                      {i18n("sendsReceivesAndApprovals")}
                                    </p>
                                  </div>
                                </div>
                                <ChevronRight
                                  className={cn(
                                    guidedSidebarChevronClass,
                                    isGuidedTransactionsSelected
                                      ? "opacity-100 text-emerald-100"
                                      : "opacity-35 text-muted-foreground"
                                  )}
                                />
                              </button>
                            </SpotlightCard>
                          ) : null}

                        </AnimatedList>
                      </div>
                      {everydayActions.length > 0 ? (
                        <GuidedActionSectionView title={i18n("commonActions")} actions={everydayActions} />
                      ) : (
                        <div className="rounded-lg border border-border/60 bg-background/30 p-3">
                          <p className="text-sm font-medium text-foreground">
                            {i18n("noDailyActionsYet")}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {i18n("addFundsOrAdjustWalletAccessToUnlock")}
                          </p>
                        </div>
                      )}
                      {guidedAdminGroups.length > 0 ? (
                        <GuidedAdminSectionView />
                      ) : (
                        <div className="rounded-lg border border-border/60 bg-background/30 p-3">
                          <p className="text-sm font-medium text-foreground">
                            {i18n("noManagementActions")}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {i18n("theWalletYouConnectedCannotManageThisSmart")}
                          </p>
                        </div>
                      )}
                      {advancedActions.length > 0 ? (
                        <details className="rounded-lg border border-border/40 bg-background/20 p-3">
                          <summary className="cursor-pointer eyebrow font-semibold text-muted-foreground">
                            {i18n("advanced")}
                          </summary>
                          <div className="mt-3">
                            <GuidedActionSectionView title={null} actions={advancedActions} />
                          </div>
                        </details>
                      ) : null}
                      <StakeAddressDiscoveryPanel
                        sttPolicyId={orphanDiscoveryPolicyId}
                        sttAssetNameHex={orphanDiscoveryAssetNameHex}
                        walletScriptAddress={orphanDiscoveryWalletAddress}
                        enabled={networkId === 0}
                        onConsolidate={handleConsolidateOrphans}
                      />
                    </div>
                  </div>
                ) : null}

                {!selectedDetectedToken && !walletIsResolving ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => dispatchWorkspaceAction({ type: "open-landing" })}
                  >
                    <House className="h-4 w-4" />
                    {i18n("chooseAWallet")}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
  );
}
