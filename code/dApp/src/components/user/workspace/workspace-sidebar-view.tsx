"use client";
import { useTranslations } from "next-intl";

import { recentWalletActivityEventsAtom, walletTransactionsAtom } from "@/components/user/workspace/atoms/workspace-activity.atoms";
import { orphanDiscoveryAssetNameHexAtom, orphanDiscoveryPolicyIdAtom, orphanDiscoveryWalletAddressAtom, selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
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
import { InfoHint } from "@/components/ui/info-hint";

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

  return (
            <Card className="user-surface order-1 flex min-h-0 flex-col xl:sticky xl:top-4 xl:max-h-[calc(100dvh-1.5rem)] xl:self-start">
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pt-4">
                {!selectedDetectedToken ? (
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{i18n("buildingANewWallet")}</p>
                      <InfoHint label={i18n("moreAboutSetupMode")} contentClassName="max-w-sm">
                        {i18n("setThePeopleRulesAndStarterFundsThe")}
                      </InfoHint>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {i18n("completeTheDetailsThenReviewTheResult")}
                    </p>
                  </div>
                ) : null}

                <div className="user-scrollbar min-h-0 overflow-x-clip overflow-y-auto px-1 pb-1 pr-2">
                  {selectedDetectedToken ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="px-1 pt-1 text-[11px] font-medium text-muted-foreground/70">
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
                            className="min-w-0 rounded-2xl"
                            spotlightColor="rgba(82, 255, 220, 0.16)"
                          >
                            {isGuidedHomeSelected ? <SidebarActiveGlow /> : null}
                            <button
                              type="button"
                              onClick={() => openGuidedOverview("home")}
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
                                    {i18n("balanceAccessAndRecentChanges")}
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
                              className="min-w-0 rounded-2xl"
                              spotlightColor="rgba(82, 255, 220, 0.16)"
                            >
                              {isGuidedTransactionsSelected ? <SidebarActiveGlow /> : null}
                              <button
                                type="button"
                                onClick={() => openGuidedOverview("transactions")}
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
                                      {i18n("everyConfirmedWalletTransaction")}
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
                      {guidedEverydayActions.length > 0 ? (
                        <GuidedActionSectionView title={i18n("commonActions")} actions={guidedEverydayActions} />
                      ) : (
                        <div className="rounded-xl border border-border/60 bg-background/30 p-3">
                          <p className="text-sm font-medium text-foreground">
                            {i18n("noSpendingActionsAvailable")}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {i18n("thisWalletNeedsFundsAndAnEligibleSigner")}
                          </p>
                        </div>
                      )}
                      {guidedAdminGroups.length > 0 ? (
                        <GuidedAdminSectionView />
                      ) : (
                        <div className="rounded-xl border border-border/60 bg-background/30 p-3">
                          <p className="text-sm font-medium text-foreground">
                            {i18n("managementIsUnavailable")}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {i18n("theConnectedSignerIsNotAnOwnerOr")}
                          </p>
                        </div>
                      )}
                      {guidedToolActions.length > 0 ? (
                        <details className="rounded-xl border border-border/40 bg-background/20 px-3 py-2">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {i18n("advanced")}
                          </summary>
                          <div className="mt-3">
                            {<GuidedActionSectionView title={null} actions={guidedToolActions} />}
                          </div>
                        </details>
                      ) : null}
                      {selectedDetectedToken ? (
                        <StakeAddressDiscoveryPanel
                          sttPolicyId={orphanDiscoveryPolicyId}
                          sttAssetNameHex={orphanDiscoveryAssetNameHex}
                          walletScriptAddress={orphanDiscoveryWalletAddress}
                          enabled={networkId === 0}
                          onConsolidate={handleConsolidateOrphans}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-primary/40 bg-primary/10 p-3">
                      <p className="text-sm font-medium text-foreground">{i18n("newWalletSetup")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {i18n("addPeopleRulesAndStarterFunds")}
                      </p>
                    </div>
                  )}
                </div>

                {!selectedDetectedToken ? (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => dispatchWorkspaceAction({ type: "open-landing" })}
                    >
                      <House className="h-4 w-4" />
                      {i18n("home")}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
  );
}
