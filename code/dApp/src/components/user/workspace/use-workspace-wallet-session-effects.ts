"use client";
import { detectedSttTokensAtom, detectedSttTokensErrorAtom, detectedSttTokensLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useWorkspaceRouteState } from "@/components/user/use-workspace-controller";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { useSetAtom, useAtomValue } from "jotai";
import { consolidateStateFormAtom, consolidateSttAssetsAtom, consolidateSttInputHashAtom, consolidateSttInputIndexAtom, consolidateWalletInputsAtom, consolidateWalletOutputsAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import { voteSttAssetsAtom, voteSttInputHashAtom, voteSttInputIndexAtom, voteSttStateFormAtom, voteZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/vote-form.atoms";
import { publishSttAssetsAtom, publishSttInputHashAtom, publishSttInputIndexAtom, publishSttStateFormAtom, publishZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import { streamingPaymentPayoutAmountsAtom, sttExtraTransfersAtom, sttInputOutputIndexAtom, sttInputTxHashAtom, sttOutputAssetsAtom, sttProofOfLifeOverrideModeAtom, sttProofOfLifeSpecificDateTimeAtom, sttStateFormAtom, sttTransferAddressAtom, sttTransferAmountsAtom, sttWalletInputsAtom, sttWalletOutputsAtom, sttZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { transferCustomAddressAtom, transferDisplayAmountAtom, transferRecipientModeAtom, transferSelectedUnitAtom } from "@/components/user/workspace/atoms/forms/transfer-form.atoms";
import { withdrawSttAssetsAtom, withdrawSttInputHashAtom, withdrawSttInputIndexAtom, withdrawSttStateFormAtom, withdrawZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";

import { useEffect } from "react";

import type {
  UserFlowBranch
} from "@/components/user/flow-types";

import {
  stateFormFromDatum
} from "@/lib/contracts/state-form";

import { type useWalletContext } from "@/providers/wallet-provider";
import { type useWorkspacePermissionWalletCards } from "@/components/user/workspace/use-workspace-permission-wallet-cards";
import { type useStore } from "jotai";
import { mintConfirmationRunAtom
} from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { cloneStateForm } from "@/components/user/workspace/helpers";
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
export type WorkspaceWalletSessionEffectsCtx =
  {
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
    ,
  } = ctx;
  const detectedSttTokens = useAtomValue(detectedSttTokensAtom);
  const detectedSttTokensLoading = useAtomValue(detectedSttTokensLoadingAtom);
  const detectedSttTokensError = useAtomValue(detectedSttTokensErrorAtom);
  const { routeState, commitRouteState, dispatch: dispatchWorkspaceAction } = useWorkspaceRouteState();
  const setConfig = useSetAtom(configAtom);
  const setConsolidateStateForm = useSetAtom(consolidateStateFormAtom);
  const setConsolidateSttAssets = useSetAtom(consolidateSttAssetsAtom);
  const setConsolidateSttInputHash = useSetAtom(consolidateSttInputHashAtom);
  const setConsolidateSttInputIndex = useSetAtom(consolidateSttInputIndexAtom);
  const setConsolidateWalletInputs = useSetAtom(consolidateWalletInputsAtom);
  const setConsolidateWalletOutputs = useSetAtom(consolidateWalletOutputsAtom);
  const setVoteSttAssets = useSetAtom(voteSttAssetsAtom);
  const setVoteSttInputHash = useSetAtom(voteSttInputHashAtom);
  const setVoteSttInputIndex = useSetAtom(voteSttInputIndexAtom);
  const setVoteSttStateForm = useSetAtom(voteSttStateFormAtom);
  const setVoteZeroAdminConfirmed = useSetAtom(voteZeroAdminConfirmedAtom);
  const setPublishSttAssets = useSetAtom(publishSttAssetsAtom);
  const setPublishSttInputHash = useSetAtom(publishSttInputHashAtom);
  const setPublishSttInputIndex = useSetAtom(publishSttInputIndexAtom);
  const setPublishSttStateForm = useSetAtom(publishSttStateFormAtom);
  const setPublishZeroAdminConfirmed = useSetAtom(publishZeroAdminConfirmedAtom);
  const setStreamingPaymentPayoutAmounts = useSetAtom(streamingPaymentPayoutAmountsAtom);
  const setSttExtraTransfers = useSetAtom(sttExtraTransfersAtom);
  const setSttInputOutputIndex = useSetAtom(sttInputOutputIndexAtom);
  const setSttInputTxHash = useSetAtom(sttInputTxHashAtom);
  const setSttOutputAssets = useSetAtom(sttOutputAssetsAtom);
  const setSttProofOfLifeOverrideMode = useSetAtom(sttProofOfLifeOverrideModeAtom);
  const setSttProofOfLifeSpecificDateTime = useSetAtom(sttProofOfLifeSpecificDateTimeAtom);
  const setSttStateForm = useSetAtom(sttStateFormAtom);
  const setSttTransferAddress = useSetAtom(sttTransferAddressAtom);
  const setSttTransferAmounts = useSetAtom(sttTransferAmountsAtom);
  const setSttWalletInputs = useSetAtom(sttWalletInputsAtom);
  const setSttWalletOutputs = useSetAtom(sttWalletOutputsAtom);
  const setSttZeroAdminConfirmed = useSetAtom(sttZeroAdminConfirmedAtom);
  const setTransferCustomAddress = useSetAtom(transferCustomAddressAtom);
  const setTransferDisplayAmount = useSetAtom(transferDisplayAmountAtom);
  const setTransferRecipientMode = useSetAtom(transferRecipientModeAtom);
  const setTransferSelectedUnit = useSetAtom(transferSelectedUnitAtom);
  const setWithdrawSttAssets = useSetAtom(withdrawSttAssetsAtom);
  const setWithdrawSttInputHash = useSetAtom(withdrawSttInputHashAtom);
  const setWithdrawSttInputIndex = useSetAtom(withdrawSttInputIndexAtom);
  const setWithdrawSttStateForm = useSetAtom(withdrawSttStateFormAtom);
  const setWithdrawZeroAdminConfirmed = useSetAtom(withdrawZeroAdminConfirmedAtom);

  useEffect(() => {
    // Selection side-effect: when a default wallet resolves, populate every
    // editor form and commit route state. Inherently a batch of synchronous
    // setStates plus a routing side effect, which belong in an effect.
     
    if (
      !walletReady ||
      selectedDetectedTokenUnit ||
      userFlowBranch === "new-wallet" ||
      // While a mint is broadcasting/confirming, never auto-select a default
      // wallet here — its reset block clears mintConfirmation/submitHash and bumps
      // the confirmation run-ref, which would cancel the watch and close the
      // overlay mid-flow (the "overlay resets / flashing" bug). The celebration's
      // "Open wallet" selects the new wallet explicitly once it's done.
      (mintConfirmation != null && mintConfirmation.phase !== "confirmed")
    ) {
      return;
    }

    if (!defaultDetectedWalletUnit) {
      return;
    }

    const selectedToken = detectedSttTokens.find(
      (token) => token.unit === defaultDetectedWalletUnit
    );

    if (!selectedToken) {
      return;
    }

    const nextStateForm = stateFormFromDatum(selectedToken.datum);
    const inputTxHash = selectedToken.utxo.input.txHash;
    const inputOutputIndex = selectedToken.utxo.input.outputIndex.toString();

    commitRouteState({
      workspaceMode: "existing-wallet",
      selectedWalletUnit: selectedToken.unit,
      selectedAction: null,
      selectedIntent: null,
      selectedTask: null,
      flowStep: "overview"
    });
       
    setConfig((current) => ({
      ...current,
      sttAssetNameHex: selectedToken.assetNameHex,
      walletPolicyId: selectedToken.policyId,
      walletAssetNameHex: selectedToken.assetNameHex
    }));
    setSttInputTxHash(inputTxHash);
    setSttInputOutputIndex(inputOutputIndex);
    setSttZeroAdminConfirmed(false);
    setWithdrawSttInputHash(inputTxHash);
    setWithdrawSttInputIndex(inputOutputIndex);
    setWithdrawZeroAdminConfirmed(false);
    setPublishSttInputHash(inputTxHash);
    setPublishSttInputIndex(inputOutputIndex);
    setPublishZeroAdminConfirmed(false);
    setVoteSttInputHash(inputTxHash);
    setVoteSttInputIndex(inputOutputIndex);
    setVoteZeroAdminConfirmed(false);
    setConsolidateSttInputHash(inputTxHash);
    setConsolidateSttInputIndex(inputOutputIndex);
    setSttStateForm(cloneStateForm(nextStateForm));
    setSttOutputAssets([]);
    setSttWalletInputs([]);
    setSttWalletOutputs([]);
    setSttExtraTransfers([]);
    setSttProofOfLifeOverrideMode("auto");
    setSttProofOfLifeSpecificDateTime("");
    setSttTransferAddress("");
    setSttTransferAmounts({});
    setTransferRecipientMode(activeAddress ? "my-address" : "custom");
    setTransferCustomAddress("");
    setTransferSelectedUnit("lovelace");
    setTransferDisplayAmount("");
    setStreamingPaymentPayoutAmounts({});
    setWithdrawSttStateForm(cloneStateForm(nextStateForm));
    setWithdrawSttAssets([]);
    setPublishSttStateForm(cloneStateForm(nextStateForm));
    setPublishSttAssets([]);
    setVoteSttStateForm(cloneStateForm(nextStateForm));
    setVoteSttAssets([]);
    setConsolidateStateForm(cloneStateForm(nextStateForm));
    setConsolidateSttAssets([]);
    setConsolidateWalletInputs([]);
    setConsolidateWalletOutputs([]);
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
    resetSharedReferencePreview,
    detectedSttTokens,
    mintConfirmation,
    selectedDetectedTokenUnit,
    userFlowBranch,
    setSelectedDetectedTokenUnit,
    walletReady,
    setConfig,
    setConsolidateStateForm,
    setConsolidateSttAssets,
    setConsolidateSttInputHash,
    setConsolidateSttInputIndex,
    setConsolidateWalletInputs,
    setConsolidateWalletOutputs,
    setVoteSttAssets,
    setVoteSttInputHash,
    setVoteSttInputIndex,
    setVoteSttStateForm,
    setVoteZeroAdminConfirmed,
    setPublishSttAssets,
    setPublishSttInputHash,
    setPublishSttInputIndex,
    setPublishSttStateForm,
    setPublishZeroAdminConfirmed,
    setStreamingPaymentPayoutAmounts,
    setSttExtraTransfers,
    setSttInputOutputIndex,
    setSttInputTxHash,
    setSttOutputAssets,
    setSttProofOfLifeOverrideMode,
    setSttProofOfLifeSpecificDateTime,
    setSttStateForm,
    setSttTransferAddress,
    setSttTransferAmounts,
    setSttWalletInputs,
    setSttWalletOutputs,
    setSttZeroAdminConfirmed,
    setTransferCustomAddress,
    setTransferDisplayAmount,
    setTransferRecipientMode,
    setTransferSelectedUnit,
    setWithdrawSttAssets,
    setWithdrawSttInputHash,
    setWithdrawSttInputIndex,
    setWithdrawSttStateForm,
    setWithdrawZeroAdminConfirmed,
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

    dispatchWorkspaceAction({ type: "start-create-wallet" });
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
