"use client";
import { useTranslations } from "next-intl";

import { useSetAtom } from "jotai";
import { walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import {
  Plus,
  Wallet2
} from "lucide-react";

import {
  AnimatedContent
} from "@/components/react-bits/primitives";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

export function WorkspaceLandingView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceLandingView");
  const state = useWorkspaceActions();
  const setWalletConnectionDialogOpen = useSetAtom(walletConnectionDialogOpenAtom);
  const {
    handleFlowBranchSelect,
    refreshDetectedTokens,
    refreshPermissionWalletSummaries,
  } = state;

  return (
          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <AnimatedContent distance={20}>
              <Card className="user-surface flex min-h-0 flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Plus className="h-4 w-4 text-primary" />
                    {i18n("createWallet")}
                  </CardTitle>
                  <CardDescription>
                    {i18n("setItsPeopleSpendingLimitsRecoveryPlanAnd")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 items-end">
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => handleFlowBranchSelect("new-wallet")}
                  >
                    <Plus className="h-4 w-4" />
                    {i18n("buildAWallet")}
                  </Button>
                </CardContent>
              </Card>
            </AnimatedContent>

            <AnimatedContent distance={24} delay={70}>
              <Card className="user-surface relative flex min-h-0 flex-col overflow-hidden">
                <CardHeader className="relative pb-3">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Wallet2 className="h-4 w-4 text-primary" />
                      {i18n("openAWallet")}
                    </CardTitle>
                    <CardDescription>
                      {i18n("chooseASmartWalletLinkedToThisSigner")}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="relative flex flex-1 items-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setWalletConnectionDialogOpen(true);
                      void refreshDetectedTokens();
                      void refreshPermissionWalletSummaries();
                    }}
                  >
                    <Wallet2 className="h-4 w-4" />
                    {i18n("chooseWallet")}
                  </Button>
                </CardContent>
              </Card>
            </AnimatedContent>
          </div>
  );
}
