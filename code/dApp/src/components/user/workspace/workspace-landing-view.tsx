"use client";
import { useSetAtom } from "jotai";
import { walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import {
  Plus,
  Wallet2
} from "lucide-react";

import {
  AnimatedContent,
  FadeContent,
  SoftAurora
} from "@/components/react-bits/primitives";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

export function WorkspaceLandingView() {
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
                    Create wallet
                  </CardTitle>
                  <CardDescription>
                    Start a fresh wallet with people, rules, and first funds.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <FadeContent
                    blur
                    className="rounded-2xl border border-border/60 bg-background/40 p-4"
                  >
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      New smart wallet
                      <InfoHint label="More about new wallets" contentClassName="max-w-sm">
                        Use this when you are creating your first wallet. Daily work starts by
                        opening an existing wallet.
                      </InfoHint>
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Best for first setup.
                    </p>
                  </FadeContent>
                  <div className="space-y-3">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => handleFlowBranchSelect("new-wallet")}
                    >
                      <Plus className="h-4 w-4" />
                      Start setup
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      You can switch wallets later.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </AnimatedContent>

            <AnimatedContent distance={24} delay={70}>
              <Card className="user-surface relative flex min-h-0 flex-col overflow-hidden">
                <SoftAurora className="opacity-65" />
                <CardHeader className="relative z-10 pb-3">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Wallet2 className="h-4 w-4 text-primary" />
                      Open wallet
                    </CardTitle>
                    <CardDescription>
                      Choose which smart wallet this session should use.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="relative z-10 flex flex-1 flex-col justify-between gap-4">
                  <FadeContent
                    blur
                    className="rounded-2xl border border-border/60 bg-background/40 p-4"
                  >
                    <p className="text-sm font-medium text-foreground">Wallet picker</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Open an existing smart wallet or create a new one from the same popup.
                    </p>
                  </FadeContent>
                  <div className="space-y-3">
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
                      Open smart wallets
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      The popup lists your wallets and lets you create a new one.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </AnimatedContent>
          </div>
  );
}
