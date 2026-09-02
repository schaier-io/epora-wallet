"use client";
import { useTranslations } from "next-intl";

import { useSetAtom } from "jotai";
import { walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import {
  Plus,
  Wallet2
} from "lucide-react";

import {
  AnimatedContent,
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

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

/**
 * Shown when a wallet is connected but no smart wallet is open: two peer choices, create
 * or open.
 *
 * Each card used to wrap its button in a bordered panel, and both panels restated the card
 * around them. The left one said "New smart wallet" (the title) and "Best for first setup."
 * (its own hint, one line up). The right one said "Open an existing smart wallet or create a
 * new one from the same popup", and the footnote directly below it said "The popup lists your
 * wallets and lets you create a new one" -- the same sentence twice, a few pixels apart. Four
 * of the six strings per card carried nothing, so the panels are gone and what is left is
 * title, description, action, and the one fact the action does not imply.
 *
 * "Popup" went with them. The app already uses that word for a browser extension's own
 * window ("Check the Lace extension popup and approve the connection"), which is the first
 * popup a reader meets, so reusing it for an in-app dialog made one word mean two things.
 * Neither card names the container now; they name what the reader can do in it.
 */
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
          // Equal columns. This was `[300px_minmax(0,1fr)]`, which at a 1090px panel gave
          // 300px and 774px: the narrow card held the primary button and the wide one held
          // the outline button and the aurora, so the layout and the button variants pointed
          // at opposite choices. Two peer actions get two equal columns, and the variants
          // carry the emphasis on their own.
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <AnimatedContent distance={20}>
              <Card className="user-surface flex min-h-0 flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" />
                    {i18n("createWallet")}
                  </CardTitle>
                  <CardDescription>
                    {i18n("startAFreshWalletWithItsPeopleRules")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-end gap-3">
                  {/*
                    The button used to repeat the card title verbatim: "Create wallet" twice
                    on one card, and again as the create wizard's header on the next screen.
                    Like its neighbour, it names the thing the reader reaches: the setup.
                  */}
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => handleFlowBranchSelect("new-wallet")}
                  >
                    <Plus className="h-4 w-4" />
                    {i18n("startSetup")}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {i18n("youCanSwitchWalletsLater")}
                  </p>
                </CardContent>
              </Card>
            </AnimatedContent>

            <AnimatedContent distance={24} delay={70}>
              <Card className="user-surface relative flex min-h-0 flex-col overflow-hidden">
                <SoftAurora className="opacity-65" />
                <CardHeader className="relative z-10">
                  <CardTitle className="flex items-center gap-2">
                    <Wallet2 className="h-4 w-4 text-primary" />
                    {i18n("openWallet")}
                  </CardTitle>
                  <CardDescription>
                    {i18n("pickWhichOfYourSmartWalletsToWork")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative z-10 flex flex-1 flex-col justify-end gap-3">
                  {/*
                    The button is named for the dialog it opens, whose heading is "Choose
                    smart wallet". It used to read "Open smart wallets", a third name for a
                    thing the card title already calls "Open wallet".
                  */}
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
                    {i18n("chooseSmartWallet")}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {i18n("youCanAlsoCreateANewWalletFrom")}
                  </p>
                </CardContent>
              </Card>
            </AnimatedContent>
          </div>
  );
}
