"use client";
import { useTranslations } from "next-intl";

import { mintProgressDismissedAtom } from "@/components/user/workspace/atoms/workspace-build-flags.atoms";
import { dismissedSubmitHashAtom, mintCelebrationAtom, mintConfirmationAtom, mintedWalletNameAtom, submitHashAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { walletReadyAtom } from "@/providers/wallet.atoms";
import { detectedSttTokensAtom, detectedSttTokensLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import {
  Loader2
} from "lucide-react";

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
import { MINT_CONFIRMATION_MAX_ATTEMPTS } from "@/components/user/workspace/constants";
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
  const walletConnectionDialogOpen = useAtomValue(walletConnectionDialogOpenAtom);
  const setWalletConnectionDialogOpen = useSetAtom(walletConnectionDialogOpenAtom);
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
    ?  
      (() => {
        const attempts = mintConfirmation?.attempts ?? 0;
        const maxAttempts = mintConfirmation?.maxAttempts ?? MINT_CONFIRMATION_MAX_ATTEMPTS;
        const phase = mintConfirmation?.phase ?? "waiting";
        const progress =
          phase === "confirmed"
            ? 100
            : phase === "delayed"
              ? 92
              : phase === "submitting"
                ? 8
                : Math.min(90, 30 + Math.round((attempts / maxAttempts) * 55));
        const walletName =
          mintedWalletName || normalizeWalletName(mintStateForm.walletName);
        const statusLabel =
          phase === "confirmed"
            ? i18n("liveOnChainSaveOrShareYourCard")
            : phase === "refreshing"
              ? i18n("checkingTheChainAndRefreshingYourWalletList")
              : phase === "delayed"
                ? i18n("stillWaitingThisCanTakeAnotherBlock")
                : phase === "submitting"
                  ? i18n("sendingToTheNetwork")
                  : i18n("waitingForChainConfirmation");

        const title =
          phase === "submitting"
            ? i18n("creatingWalletname", { walletName: walletName })
            : phase === "waiting"
              ? i18n("waitingForConfirmation")
              : phase === "refreshing"
                ? i18n("refreshingYourWalletList")
                : phase === "delayed"
                  ? i18n("stillConfirming")
                  : i18n("walletnameIsReady", { walletName: walletName });
        const description =
          phase === "submitting"
            ? i18n("submittingTheSignedTransactionToCardanoPreprod")
            : phase === "confirmed"
              ? i18n("theWalletIsConfirmedOnCardanoPreprodSave")
              : i18n("theTransactionWasSubmittedKeepThisPageOpen");

        return {
          title,
          description,
          statusLabel,
          progress,
          actionLabel: phase === "submitting" ? undefined : i18n("createAnotherWallet"),
           
          onAction: phase === "submitting" ? undefined : handleCreateAnotherWallet,
          secondaryActionLabel: mintConfirmation?.createdWalletUnit ? i18n("openWallet") : undefined,
          onSecondaryAction: mintConfirmation?.createdWalletUnit
            ? handleOpenCreatedWallet
            : undefined
        };
      })()
    : null;

    return (
      <section
        className="flex min-h-0 flex-1 flex-col gap-4 md:gap-5"
        aria-label={i18n("walletWorkspace")}
      >
        <WalletConnectionDialog
          open={walletConnectionDialogOpen}
          onOpenChange={setWalletConnectionDialogOpen}
          closeOnConnect={false}
          title={i18n("yourSmartWallets")}
          description={i18n("openOneLinkedToThisSignerOrCreate")}
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
                    {i18n("lookingForSmartWallets")}
                  </CardTitle>
                  <CardDescription>
                    {i18n("checkingPreprodForWalletsLinkedToThisSigner")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FadeContent
                    blur
                    className="rounded-2xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground"
                  >
                    {i18n("thisUsuallyTakesAFewSeconds")}
                  </FadeContent>
                </CardContent>
              </Card>
            </AnimatedContent>
          </div>
        ) : routeState.workspaceMode === "landing" ? (
          <WorkspaceLandingView />
        ) : (
          <WorkspaceLayoutView />
        )}
      </section>
    );
}
