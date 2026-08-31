"use client";
import { detectedSttTokensAtom, detectedSttTokensErrorAtom, detectedSttTokensLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useWorkspaceRouteState } from "@/components/user/use-workspace-controller";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { seedWorkspaceWalletAtom } from "@/components/user/workspace/atoms/workspace-wallet-seeding.atoms";
import { resolveWalletToSeed } from "@/components/user/workspace/helpers/wallet-session-seeding";
import { useAtomValue } from "jotai";

import { useEffect } from "react";

import type {
  UserFlowBranch
} from "@/components/user/flow-types";

import { type useWalletContext } from "@/providers/wallet-provider";
import { type useWorkspacePermissionWalletCards } from "@/components/user/workspace/use-workspace-permission-wallet-cards";
import { type useStore } from "jotai";
import { mintConfirmationRunAtom
} from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { type useSharedSttReference } from "@/components/user/workspace/use-shared-stt-reference";
import { type Dispatch, type SetStateAction } from "react";
import { type MintConfirmationState } from "@/components/user/workspace/types";
import { type BuildResult } from "@/lib/types/contracts";

/**
 * The wallet-selection side-effects, extracted from the controller hook. When a default
 * wallet resolves they auto-select it and seed the route + per-action form drafts from the
 * detected token; a second effect clears stale build state when the wallet/network changes.
 * These populate DRAFT state only (pre-signing); the build/submit path is untouched. A hook
 * (owns useEffect), called once from the controller; the ctx spreads the form shapes plus the
 * route / detected-token / build-state inputs.
 */
export type WorkspaceWalletSessionEffectsCtx = {
  activeAddress: ReturnType<typeof useWalletContext>["activeAddress"];
  defaultDetectedWalletUnit: ReturnType<typeof useWorkspacePermissionWalletCards>["defaultDetectedWalletUnit"];
  jotaiStore: ReturnType<typeof useStore>;
  knownPermissionWalletCount: ReturnType<typeof useWorkspacePermissionWalletCards>["knownPermissionWalletCount"];
  mintConfirmation: MintConfirmationState | null;
  resetSharedReferencePreview: ReturnType<typeof useSharedSttReference>["resetSharedReferencePreview"];
  selectedDetectedTokenUnit: string;
  setBuildError: Dispatch<SetStateAction<string | null>>;
  setBuildErrorDetails: Dispatch<SetStateAction<string | null>>;
  setLastActionLabel: Dispatch<SetStateAction<string>>;
  setMintConfirmation: Dispatch<SetStateAction<MintConfirmationState | null>>;
  setPreview: Dispatch<SetStateAction<BuildResult | null>>;
  setPreviewSignature: Dispatch<SetStateAction<string | null>>;
  setSelectedDetectedTokenUnit: (nextUnit: string) => void;
  setSubmitHash: Dispatch<SetStateAction<string | null>>;
  userFlowBranch: UserFlowBranch | null;
  walletReady: boolean;
};

export function useWorkspaceWalletSessionEffects(ctx: WorkspaceWalletSessionEffectsCtx): void {
  const {
    activeAddress,
    defaultDetectedWalletUnit,
    jotaiStore,
    knownPermissionWalletCount,
    mintConfirmation,
    resetSharedReferencePreview,
    selectedDetectedTokenUnit,
    setBuildError,
    setBuildErrorDetails,
    setLastActionLabel,
    setMintConfirmation,
    setPreview,
    setPreviewSignature,
    setSelectedDetectedTokenUnit,
    setSubmitHash,
    userFlowBranch,
    walletReady
  } = ctx;
  const detectedSttTokens = useAtomValue(detectedSttTokensAtom);
  const detectedSttTokensLoading = useAtomValue(detectedSttTokensLoadingAtom);
  const detectedSttTokensError = useAtomValue(detectedSttTokensErrorAtom);
  const { routeState, commitRouteState, dispatch: dispatchWorkspaceAction } = useWorkspaceRouteState();

  useEffect(() => {
    // Selection side-effect: when a default wallet resolves, seed every editor
    // form through one store write and commit the matching route state.
    if (
      !walletReady ||
      userFlowBranch === "new-wallet" ||
      // While a mint is broadcasting/confirming, never auto-select a default
      // wallet here: its reset block clears mintConfirmation/submitHash and bumps
      // the confirmation run-ref, which would cancel the watch and close the
      // overlay mid-flow (the "overlay resets / flashing" bug). The celebration's
      // "Open wallet" selects the new wallet explicitly once it's done.
      (mintConfirmation != null && mintConfirmation.phase !== "confirmed")
    ) {
      return;
    }

    // A wallet named in the URL (`?wallet=<unit>`) reaches `selectedDetectedTokenUnit`
    // without anything having seeded the forms for it, and every link the app writes carries
    // that parameter. `resolveWalletToSeed` carries the reasoning and the test.
    const selectedToken = resolveWalletToSeed({
      detectedTokens: detectedSttTokens,
      selectedUnit: selectedDetectedTokenUnit,
      defaultUnit: defaultDetectedWalletUnit,
      config: jotaiStore.get(configAtom)
    });

    if (!selectedToken) {
      return;
    }

    // Set only what is missing. This effect's job is to pick a wallet when none is chosen.
    // Nulling the action here also deleted `?action=`, `?task=` and `?step=` from every deep
    // link on cold load: `selectedDetectedTokenUnit` is still empty in the window before the
    // URL's wallet reaches it, so the effect ran and wiped the rest of the link.
    // `commitRouteState` no-ops when the resulting search is unchanged, so preserving these
    // cannot loop.
    commitRouteState({
      workspaceMode: "existing-wallet",
      selectedWalletUnit: selectedToken.unit,
      selectedAction: routeState.selectedAction,
      selectedIntent: routeState.selectedIntent,
      selectedTask: routeState.selectedTask,
      flowStep: routeState.selectedAction ? routeState.flowStep : "overview",
      // Same reason as the action/task above: a deep link to `?view=activity&asset=…` must
      // survive the window in which this effect fills in the wallet.
      overviewSection: routeState.overviewSection,
      assetDetailUnit: routeState.assetDetailUnit
    });

    jotaiStore.set(seedWorkspaceWalletAtom, selectedToken);
    resetSharedReferencePreview();
    setPreview(null);
    setPreviewSignature(null);
    setLastActionLabel("");
    setBuildError(null);
    setBuildErrorDetails(null);
    setSubmitHash(null);
    setMintConfirmation(null);
    jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
  }, [
    activeAddress,
    defaultDetectedWalletUnit,
    commitRouteState,
    routeState,
    resetSharedReferencePreview,
    detectedSttTokens,
    mintConfirmation,
    selectedDetectedTokenUnit,
    userFlowBranch,
    setSelectedDetectedTokenUnit,
    walletReady,
    jotaiStore,
    setBuildError,
    setBuildErrorDetails,
    setLastActionLabel,
    setMintConfirmation,
    setPreview,
    setPreviewSignature,
    setSubmitHash
  ]);

  useEffect(() => {
    if (!walletReady) {
      return;
    }

    if (routeState.workspaceMode !== "landing") {
      return;
    }

    if (detectedSttTokensLoading || detectedSttTokensError || detectedSttTokens.length > 0) {
      return;
    }

    // Don't force create-wallet onboarding onto a signer who already has smart
    // wallets. `detectedSttTokens` can transiently read 0 (chain-detection
    // flakiness); the server-side summaries are the stable "does this signer
    // have wallets" signal. Only auto-start creation for a genuinely fresh
    // signer (no detected tokens AND no known summaries).
    if (knownPermissionWalletCount > 0) {
      return;
    }

    // `replace`, not the dispatch default of `push`. The user did not ask to be here, and a
    // pushed entry made Back inescapable: Back returned to landing, this effect saw the same
    // fresh signer and pushed create-wallet again, so every press grew the history by one.
    // There is also nothing behind it worth keeping -- a signer with no wallets has no
    // landing state to return to.
    dispatchWorkspaceAction({ type: "start-create-wallet" }, { history: "replace" });
  }, [
    detectedSttTokens.length,
    detectedSttTokensError,
    detectedSttTokensLoading,
    dispatchWorkspaceAction,
    knownPermissionWalletCount,
    routeState.workspaceMode,
    walletReady
  ]);
}
