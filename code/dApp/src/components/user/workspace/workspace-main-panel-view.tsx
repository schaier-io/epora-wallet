"use client";
import { selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { selectedActionAtom, userFlowBranchAtom, wizardSelectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { useAtomValue } from "jotai";

import { UserActionConfigurationCard } from "@/components/user/action-configuration-card";

import {
  AnimatedContent
} from "@/components/react-bits/primitives";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { WorkspaceWalletDashboardView } from "@/components/user/workspace/workspace-wallet-dashboard-view";
import { SetupCheckpointCardView } from "@/components/user/workspace/workspace-setup-checkpoint-view";
import { WorkspaceActionConfigView } from "@/components/user/workspace/workspace-action-config-view";

export function WorkspaceMainPanelView() {
  const state = useWorkspaceActions();
  const selectedAction = useAtomValue(selectedActionAtom);
  const selectedDetectedToken = useAtomValue(selectedDetectedTokenAtom);
  const userFlowBranch = useAtomValue(userFlowBranchAtom);
  const wizardSelectedAction = useAtomValue(wizardSelectedActionAtom);
  const {
    actionConfigurationRef,
    activeActionDefinition,
    clearActionDraft,
    primaryActionIssue,
    resetActionDraft,
    selectedActionRouteExplanation,
    sendRouteExplanation,
    hasActiveComposer,
  } = state;

  return (
            <div
              className="user-scrollbar order-1 min-h-0 overflow-y-auto pr-1 lg:order-2"
            >
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
                          ? "Create new wallet"
                          : `${activeActionDefinition.label} details`
                      }
                      description={
                        userFlowBranch === "new-wallet"
                          ? // The workspace header above already says what you do here ("Name the wallet,
                            // choose who can use it, and add its first funds."), so this says what the
                            // thing is instead. Same promise the celebration overlay confirms at the end.
                            "One shared Cardano wallet with key recovery. No new seed phrase: you sign with the wallet you already use."
                          : selectedActionRouteExplanation
                      }
                      selectedAction={selectedAction}
                      selectedDetectedToken={Boolean(selectedDetectedToken)}
                      primaryIssue={primaryActionIssue}
                      onReset={() => resetActionDraft(selectedAction)}
                      onClear={() => clearActionDraft(selectedAction)}
                    >
                      <div ref={actionConfigurationRef}><WorkspaceActionConfigView /></div>
                    </UserActionConfigurationCard>
                  ) : (
                    <AnimatedContent distance={18}>
                      <Card className="user-surface">
                        <CardHeader>
                          <CardTitle>Choose an action</CardTitle>
                          <CardDescription>
                            Pick a wallet job from the action rail to open its form here.
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    </AnimatedContent>
                  )}
                </div>
              )}
            </div>
  );
}
