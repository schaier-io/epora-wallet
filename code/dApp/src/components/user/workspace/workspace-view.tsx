"use client";
import { useTranslations } from "next-intl";

import { mintProgressDismissedAtom } from "@/components/user/workspace/atoms/workspace-build-flags.atoms";
import { dismissedSubmitHashAtom, mintCelebrationAtom, mintConfirmationAtom, mintedWalletNameAtom, submitHashAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { selectedTokenCapabilityMapAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { holdsAnyRole } from "@/components/user/wizard-capabilities";
import { walletReadyAtom } from "@/providers/wallet.atoms";
import { detectedSttTokensAtom, detectedSttTokensLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { walletConnectionDialogMountedAtom, walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import {
  Loader2
} from "lucide-react";
import { useEffect } from "react";

import {
  AnimatedContent,
  FadeContent
} from "@/components/react-bits/primitives";
import { WalletConnectionDialog } from "@/components/layout/wallet-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

import { MintCelebrationOverlay, WalletCreationFullscreenProgress } from "@/components/user/workspace/editors";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useMintForm } from "@/components/user/workspace/forms/use-mint-form";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import { buildMintProgressCopy } from "@/components/user/workspace/mint-progress-completion";
import { WorkspaceHeaderView } from "@/components/user/workspace/workspace-header-view";
import { WorkspaceOnboardingView } from "@/components/user/workspace/workspace-onboarding-view";
import { WorkspaceLandingView } from "@/components/user/workspace/workspace-landing-view";
import { WorkspaceLayoutView } from "@/components/user/workspace/workspace-layout-view";
import { WalletSelectionDialogView } from "@/components/user/workspace/workspace-wallet-selection-dialog-view";

export function WorkspaceView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceView");
  const state = useWorkspaceActions();
  const mintProgressDismissed = useAtomValue(mintProgressDismissedAtom);
  const setDismissedSubmitHash = useSetAtom(dismissedSubmitHashAtom);
  const setMintCelebration = useSetAtom(mintCelebrationAtom);
  const mintCelebration = useAtomValue(mintCelebrationAtom);
  const mintConfirmation = useAtomValue(mintConfirmationAtom);
  const mintedWalletName = useAtomValue(mintedWalletNameAtom);
  const routeState = useAtomValue(routeStateAtom);
  const submitHash = useAtomValue(submitHashAtom);
  const walletReady = useAtomValue(walletReadyAtom);
  const detectedSttTokens = useAtomValue(detectedSttTokensAtom);
  const detectedSttTokensLoading = useAtomValue(detectedSttTokensLoadingAtom);
  const selectedTokenCapabilityMap = useAtomValue(selectedTokenCapabilityMapAtom);
  // Every smart wallet on the policy is listed to every visitor, so a selected wallet is not
  // proof of a right to use it. Until the capability map has loaded there is nothing to
  // contradict the selection, so the workspace opens as before and this only diverts once the
  // wallet's own rules say the connected key holds no role in it.
  const selectedWalletIsUsable =
    !selectedTokenCapabilityMap || holdsAnyRole(selectedTokenCapabilityMap);
  const walletConnectionDialogOpen = useAtomValue(walletConnectionDialogOpenAtom);
  const setWalletConnectionDialogOpen = useSetAtom(walletConnectionDialogOpenAtom);
  // Tells the top nav this page already holds a `WalletConnectionDialog`, so it does not
  // mount a second one.
  const setWalletConnectionDialogMounted = useSetAtom(walletConnectionDialogMountedAtom);
  useEffect(() => {
    setWalletConnectionDialogMounted(true);
    return () => setWalletConnectionDialogMounted(false);
  }, [setWalletConnectionDialogMounted]);
  const {
    applyDetectedToken,
    handleCreateAnotherWallet,
    setSelectedDetectedTokenUnit,
    handleOpenCreatedWallet
  } = state;
  const { mintStateForm } = useMintForm();

  const mintOverlayActive =
    mintConfirmation != null && mintConfirmation.phase !== "confirmed";
  const walletCreationCompletion = mintOverlayActive
    ? {
        ...buildMintProgressCopy(
          mintConfirmation,
          mintedWalletName || normalizeWalletName(mintStateForm.walletName)
        ),
        actionLabel:
          mintConfirmation?.phase === "submitting" ? undefined : i18n("createAnotherWallet"),
        onAction:
          mintConfirmation?.phase === "submitting" ? undefined : handleCreateAnotherWallet,
        secondaryActionLabel: mintConfirmation?.createdWalletUnit ? i18n("openWallet") : undefined,
        onSecondaryAction: mintConfirmation?.createdWalletUnit
          ? handleOpenCreatedWallet
          : undefined
      }
    : null;

    // A `section`, not a `main`. `app/user/page.tsx` already opens a `main` around this, and a
    // document may hold only one: the two nested, so landmark navigation offered a `main`
    // inside a `main`. The name was broken in the same place. It pointed at the header's `h2`,
    // which the header deliberately does not render once a wallet is open, because the top nav
    // already names it. That is the state the app is usually in, so the landmark spent most of
    // its life pointing at an id that was not in the document, and a dangling `aria-labelledby`
    // leaves an element with no accessible name at all. A literal label cannot dangle.
    return (
      <section
        className="flex min-h-0 flex-1 flex-col gap-4"
        aria-label={i18n("walletWorkspace")}
      >
        <WalletConnectionDialog
          open={walletConnectionDialogOpen}
          onOpenChange={setWalletConnectionDialogOpen}
          // `closeOnConnect` keeps its default. It used to be `false` so the dialog could
          // advance to its smart-wallet step after a connect, but a connect ends the
          // dialog's job now: behind the modal the workspace already shows the wizard
          // (create intent) or the default wallet, and a fresh signer's chooser step
          // listed nothing, so the dialog closed over an empty state instead.
          title={i18n("chooseSmartWallet")}
          description={i18n("pickWhichWalletToOpenOrStartA")}
          className="max-w-3xl"
        >
          <WalletSelectionDialogView />
        </WalletConnectionDialog>
        <WalletCreationFullscreenProgress
          completion={mintProgressDismissed ? null : walletCreationCompletion}
          submitHash={submitHash}
          onClose={() => setDismissedSubmitHash(submitHash)}
        />
        {mintCelebration ? (
          <MintCelebrationOverlay
            walletName={mintCelebration.walletName}
            sttPolicyId={mintCelebration.sttPolicyId}
            createdWalletUnit={mintCelebration.createdWalletUnit}
            onClose={() => setMintCelebration(null)}
            onOpenWallet={() => {
              const unit = mintCelebration.createdWalletUnit;
              setMintCelebration(null);
              setSelectedDetectedTokenUnit(unit);
              const token = detectedSttTokens.find((entry) => entry.unit === unit);
              if (token) {
                applyDetectedToken(token);
              }
            }}
            onCreateAnother={() => {
              setMintCelebration(null);
              handleCreateAnotherWallet();
            }}
          />
        ) : null}

        <WorkspaceHeaderView />

        {!walletReady ? (
          <WorkspaceOnboardingView />
        ) : routeState.workspaceMode === "landing" && detectedSttTokensLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <AnimatedContent className="w-full max-w-md" distance={24}>
              <Card className="user-surface w-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                    {i18n("detectingWallets")}
                  </CardTitle>
                  <CardDescription>
                    {i18n("lookingUpSmartWalletsForThisSignerOn")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FadeContent
                    blur
                    className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4 text-sm text-muted-foreground"
                  >
                    {i18n("thisUsuallyTakesAFewSecondsTheSetup")}
                  </FadeContent>
                </CardContent>
              </Card>
            </AnimatedContent>
          </div>
        ) : routeState.workspaceMode === "landing" || !selectedWalletIsUsable ? (
          // Forward to the wallet selection rather than opening a workspace whose every
          // action the wallet's rules would reject.
          <WorkspaceLandingView />
        ) : (
          <WorkspaceLayoutView />
        )}
      </section>
    );
}
