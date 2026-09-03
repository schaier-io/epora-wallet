"use client";
import { useTranslations } from "next-intl";

import { detectedSttTokensErrorAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { selectedActionAtom, userFlowBranchAtom, wizardSelectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { useAtomValue } from "jotai";

import { UserActionConfigurationCard } from "@/components/user/action-configuration-card";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { WorkspaceWalletDashboardView } from "@/components/user/workspace/workspace-wallet-dashboard-view";
import { SetupCheckpointCardView } from "@/components/user/workspace/workspace-setup-checkpoint-view";
import { WorkspaceActionConfigView } from "@/components/user/workspace/workspace-action-config-view";

export function WorkspaceMainPanelView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceMainPanelView");
  const state = useWorkspaceActions();
  const selectedAction = useAtomValue(selectedActionAtom);
  const selectedDetectedToken = useAtomValue(selectedDetectedTokenAtom);
  const detectedSttTokensError = useAtomValue(detectedSttTokensErrorAtom);
  const userFlowBranch = useAtomValue(userFlowBranchAtom);
  const wizardSelectedAction = useAtomValue(wizardSelectedActionAtom);
  const {
    actionConfigurationRef,
    activeActionDefinition,
    clearActionDraft,
    resetActionDraft,
    selectedActionRouteExplanation,
    sendRouteExplanation,
    hasActiveComposer,
  } = state;

  return (
            // No padding between the scroller and its card. The three workspace columns each
            // handled this differently: the sidebar puts its scroller inside the Card, the
            // review rail adds nothing, and this one carried `pr-1`. That 4px held the panel
            // off the right edge its own column shares with the status row above it and with
            // the container gutter, so at 1440 the panel ended at 1396 while everything else
            // ended at 1400. Nor did the 4px clear the scrollbar. Where the platform draws a
            // classic one, `scrollbar-gutter: stable` has already reserved the track and the
            // padding adds nothing on top; where it draws an overlay one, nothing is reserved
            // at all -- measured here, `offsetWidth - clientWidth` is 0 on a sibling scroller
            // that is scrolling -- and 4px is too thin a margin to keep the thumb off the
            // content. The sidebar keeps its `pr-2`, where the cards it holds sit inside a card
            // whose right edge the thumb would otherwise cross.
            <div className="user-scrollbar order-1 min-h-0 overflow-y-auto lg:order-2">
              {selectedDetectedToken && !wizardSelectedAction ? (
              <WorkspaceWalletDashboardView />
              ) : (
                <div className="space-y-3">
                  {wizardSelectedAction && sendRouteExplanation ? (
                    <p className="px-1 text-xs text-muted-foreground">
                      {sendRouteExplanation}
                    </p>
                  ) : null}
                  {<SetupCheckpointCardView />}
                  {hasActiveComposer ? (
                    <UserActionConfigurationCard
                      compact
                      definition={activeActionDefinition}
                      title={
                        userFlowBranch === "new-wallet"
                          ? // The header above owns "Create wallet"; repeating it here (as
                            // "Create new wallet") read as two headings for one screen.
                            // The card names the form, not the job.
                            i18n("walletSetup")
                          : i18n("value1Details", { value1: activeActionDefinition.label })
                      }
                      description={
                        userFlowBranch === "new-wallet"
                          ? // The workspace header above already says what you do here ("Name the wallet,
                            // choose who can use it, and add its first funds."), so this says what the
                            // thing is instead. Same promise the celebration overlay confirms at the end.
                            i18n("oneSharedCardanoWalletWithKeyRecoveryNo")
                          : selectedActionRouteExplanation
                      }
                      selectedAction={selectedAction}
                      selectedDetectedToken={Boolean(selectedDetectedToken)}
                      onReset={() => resetActionDraft(selectedAction)}
                      onClear={() => clearActionDraft(selectedAction)}
                    >
                      <div ref={actionConfigurationRef}><WorkspaceActionConfigView /></div>
                    </UserActionConfigurationCard>
                  ) : detectedSttTokensError ? (
                    // The link names a wallet, but the wallet list never loaded, so nothing can
                    // match it. Say that, rather than letting the sidebar's "not one of yours"
                    // stand alone as if the wallet had been checked and rejected.
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
                      <p className="text-sm font-medium text-foreground">{i18n("couldNotLoadThisWallet")}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{detectedSttTokensError}</p>
                    </div>
                  ) : // No wallet is open and no form is staged. The sidebar already explains how
                    // to pick a wallet; a "Choose an action" card here pointed at an action rail
                    // that is not on screen in this state.
                    null}
                </div>
              )}
            </div>
  );
}
