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
  guidedSidebarSpotlightClass,
  guidedSidebarTextClass,
  guidedSidebarTitleClass,
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
  const {
    dispatchWorkspaceAction,
    handleConsolidateOrphans,
    handleRecoverOrphans,
    canRecoverOrphansDirectly,
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
  // outside that `overflow-hidden` box and would move the track inward. Both `p-` and `sm:p-`
  // have to be cleared: tailwind-merge treats them as separate groups.
  //
  // Correction: this used to say the track had to stay put so it would not break the
  // `scrollbar-gutter: stable` reservation in globals.css. There is no reservation. Measured in
  // Chromium on macOS, `offsetWidth - clientWidth` is 0 on a `.user-scrollbar` that is actually
  // scrolling, because the thumb is an overlay one and `scrollbar-gutter` only applies to
  // classic scrollbars. Keeping the track at the card edge is still right, but the reason is
  // the full-bleed look, not a gutter that was never reserved.
  return (
            // `top-20`, not `top-4`: the sticky TopNav is 65px tall (the `h-16` row plus
            // its 1px `border-b`), so 80px from the viewport top leaves 15px of
            // clearance below it. The max-height spends the same 80px:
            // 100dvh - 80px top - 8px bottom.
            <Card className="user-surface order-2 flex min-h-0 flex-col p-0 sm:p-0 lg:sticky lg:top-20 lg:order-1 lg:max-h-[calc(100dvh-5.5rem)] lg:self-start">
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
                {walletIsResolving ? (
                  // Not a live region: the header's skeleton announces the same load, so two
                  // `role="status"` regions read "Loading your wallet…" twice.
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{i18n("loadingYourWallet")}</p>
                    <Skeleton className="h-4 w-24" aria-hidden="true" />
                    <Skeleton className="h-16 w-full rounded-lg" aria-hidden="true" />
                    <Skeleton className="h-16 w-full rounded-lg" aria-hidden="true" />
                    <Skeleton className="h-9 w-full rounded-md" aria-hidden="true" />
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
                  // No `pr-2` here. It was meant to clear the scrollbar track, but measured in
                  // Chromium on macOS `.user-scrollbar` reserves nothing: offsetWidth -
                  // clientWidth is 0 while the list overflows, because the thumb is an overlay
                  // and `scrollbar-gutter: stable` only applies to classic scrollbars. So the
                  // 8px bought no clearance and cost symmetry -- it left the nav column 20px
                  // from the CardContent gutter on the left and 24px on the right, on 19 screens.
                  // `px-1` alone centres it.
                  //
                  // This overrules the note at `layout-breakpoints.test.ts:425-437`, which called
                  // this `pr-2` the sidebar's settled choice "because its cards sit inside a card
                  // whose right edge the thumb would otherwise cover". That reason does not hold:
                  // the thumb paints at the scroller's edge, 16px inside the Card's own edge, so
                  // what it can cover is the outer 4px of a nav card while scrolling, never the
                  // Card. The same note already lists "reserve nothing and let the thumb float
                  // over the content" as the other settled answer, and the main panel, the review
                  // rail and the two proposal lists all take it. The sidebar now does too.
                  <div className="user-scrollbar min-h-0 space-y-4 overflow-x-clip overflow-y-auto px-1 pb-1">
                    {/* This column is the app's second navigation and it had no landmark:
                        every entry below moves the main panel, but a screen reader met a card
                        full of buttons with nothing to jump to. The `space-y-4` that used to
                        sit on a plain wrapper is now split -- the `nav` keeps the four groups
                        at their old gaps, and the scroller keeps the gap to the discovery
                        panel, which stays outside the landmark because it is not navigation.
                        Labelled, because `top-nav.tsx:215` already claims "Primary". */}
                    <nav className="space-y-4" aria-label={i18n("walletNavigation")}>
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
                            className={guidedSidebarSpotlightClass}
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
                              <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
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
                              className={guidedSidebarSpotlightClass}
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
                                <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
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
                                        // `leading-none` keeps the count badge on the 17.5px title
                                        // line; the default `text-xs` leading made this row taller
                                        // than every other two-line row.
                                        className="whitespace-nowrap leading-none"
                                      >
                                        {walletTransactions.loading
                                          ? i18n("refreshing")
                                          : i18n("value1", { value1: recentWalletActivityEvents.length })}
                                      </Badge>
                                    </div>
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
                        // No wrapper padding, border or tint: those indented this group's left
                        // edge 13px and narrowed its cards 254 -> 228 while the two groups above
                        // it sit flush against the scroller. The tint has to go with the padding:
                        // with no inset it would sit directly behind cards that are themselves
                        // `bg-background/20`, so every ADVANCED card would composite two coats
                        // and read darker than the identical cards above it.
                        // `pt-1`, not `mt-1`: a top margin collapses with the summary's `-mt-2`
                        // below and with the 16px `space-y-4` above, which left the heading 16px
                        // under the previous card where its peers sit at 20px. Padding does not
                        // collapse, so it restores the peer rhythm and keeps the summary's
                        // negative margin inside this box.
                        <details className="pt-1">
                          {/* `py-2 -my-2` lifts the 13.2px eyebrow line to a 29.2px target
                              without moving anything: the padding grows the box, the negative
                              margin gives the space back. Measured: the text lands where an
                              unpadded summary puts it, and the hit box still stops 12px short
                              of the card above. */}
                          <summary className="eyebrow -my-2 flex cursor-pointer list-none items-center gap-2 py-2 font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
                            <ChevronRight className="expand-chevron h-4 w-4 shrink-0" aria-hidden="true" />
                            {i18n("advanced")}
                          </summary>
                          {/* `pt-1` keeps the first card inside the clip. The expand animation
                              (`globals/animations.css`, `details::details-content`) sets
                              `overflow-y: clip`, and the `mt-2` collapses out of that box, so its
                              top edge was the first card's top border: the 2px hover lift pushed
                              the border above it. Padding does not collapse, so the card sits 4px
                              inside the clip. Measured at 3x: without it the border row reads as
                              background on hover. */}
                          <div className="mt-2 pt-1">
                            <GuidedActionSectionView title={null} actions={advancedActions} />
                          </div>
                        </details>
                      ) : null}
                    </nav>
                    <StakeAddressDiscoveryPanel
                      sttPolicyId={orphanDiscoveryPolicyId}
                      sttAssetNameHex={orphanDiscoveryAssetNameHex}
                      walletScriptAddress={orphanDiscoveryWalletAddress}
                      enabled={networkId === 0}
                      onConsolidate={handleConsolidateOrphans}
                      onRecover={
                        canRecoverOrphansDirectly ? handleRecoverOrphans : undefined
                      }
                    />
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
