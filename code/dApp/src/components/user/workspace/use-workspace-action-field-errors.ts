"use client";
import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { consolidateSttAssetsAtom, consolidateSttInputHashAtom, consolidateSttInputIndexAtom, consolidateWalletInputsAtom, consolidateWalletOutputsAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import { lockFundsAssetsAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";
import { mintStarterAssetsAtom, mintStateFormAtom, mintZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { voteJsonAtom, voteSttAssetsAtom, voteSttInputHashAtom, voteSttInputIndexAtom, voteSttStateFormAtom, voteZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/vote-form.atoms";
import { publishCertificateJsonAtom, publishSttAssetsAtom, publishSttInputHashAtom, publishSttInputIndexAtom, publishSttStateFormAtom, publishZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import { consolidateAuthorityPathAtom, sttAuthorityPathAtom, sttExtraTransfersAtom, sttInputOutputIndexAtom, sttInputTxHashAtom, sttOutputAssetsAtom, sttProofOfLifeOverrideModeAtom, sttProofOfLifeSpecificDateTimeAtom, sttStateFormAtom, sttWalletInputsAtom, sttWalletOutputsAtom, sttZeroAdminConfirmedAtom, walletOperatorPathAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { walletSpendInputHashAtom, walletSpendInputIndexAtom, walletSpendOutputsAtom, walletSpendRedeemerPresetAtom } from "@/components/user/workspace/atoms/forms/wallet-spend-form.atoms";
import { withdrawAmountAtom, withdrawRewardAddressAtom, withdrawSttAssetsAtom, withdrawSttInputHashAtom, withdrawSttInputIndexAtom, withdrawSttStateFormAtom, withdrawZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";
import { computeActionFieldErrors } from "@/components/user/workspace/action-validation";
import type { FieldErrors, UserActionKind } from "@/components/user/flow-types";

/**
 * Per-action field-validation map. Extracted from the controller: it self-sources the ~44 form
 * fields it validates directly from the form atoms, taking only the handful of derived, non-form
 * inputs via ctx. Returns the same Record<UserActionKind, FieldErrors> the controller used to compute inline.
 */
export type WorkspaceActionFieldErrorsCtx = Pick<
  Parameters<typeof computeActionFieldErrors>[0],
  "activeInferredSttStateForm" | "activePaymentKeyHash" | "existingWalletNames" | "selectedDetectedToken" | "selectedDetectedTokenStateForm" | "streamingPaymentPayoutRows" | "streamingPaymentPayoutTransfers" | "useAllowancePreview"
>;

export function useWorkspaceActionFieldErrors(ctx: WorkspaceActionFieldErrorsCtx): Record<UserActionKind, FieldErrors> {
  const {
    activeInferredSttStateForm,
    activePaymentKeyHash,
    existingWalletNames,
    selectedDetectedToken,
    selectedDetectedTokenStateForm,
    streamingPaymentPayoutRows,
    streamingPaymentPayoutTransfers,
    useAllowancePreview
  } = ctx;
  const consolidateAuthorityPath = useAtomValue(consolidateAuthorityPathAtom);
  const consolidateSttAssets = useAtomValue(consolidateSttAssetsAtom);
  const consolidateSttInputHash = useAtomValue(consolidateSttInputHashAtom);
  const consolidateSttInputIndex = useAtomValue(consolidateSttInputIndexAtom);
  const consolidateWalletInputs = useAtomValue(consolidateWalletInputsAtom);
  const consolidateWalletOutputs = useAtomValue(consolidateWalletOutputsAtom);
  const lockFundsAssets = useAtomValue(lockFundsAssetsAtom);
  const mintStarterAssets = useAtomValue(mintStarterAssetsAtom);
  const mintStateForm = useAtomValue(mintStateFormAtom);
  const mintZeroAdminConfirmed = useAtomValue(mintZeroAdminConfirmedAtom);
  const voteJson = useAtomValue(voteJsonAtom);
  const voteSttAssets = useAtomValue(voteSttAssetsAtom);
  const voteSttInputHash = useAtomValue(voteSttInputHashAtom);
  const voteSttInputIndex = useAtomValue(voteSttInputIndexAtom);
  const voteSttStateForm = useAtomValue(voteSttStateFormAtom);
  const voteZeroAdminConfirmed = useAtomValue(voteZeroAdminConfirmedAtom);
  const publishCertificateJson = useAtomValue(publishCertificateJsonAtom);
  const publishSttAssets = useAtomValue(publishSttAssetsAtom);
  const publishSttInputHash = useAtomValue(publishSttInputHashAtom);
  const publishSttInputIndex = useAtomValue(publishSttInputIndexAtom);
  const publishSttStateForm = useAtomValue(publishSttStateFormAtom);
  const publishZeroAdminConfirmed = useAtomValue(publishZeroAdminConfirmedAtom);
  const sttAuthorityPath = useAtomValue(sttAuthorityPathAtom);
  const sttExtraTransfers = useAtomValue(sttExtraTransfersAtom);
  const sttInputOutputIndex = useAtomValue(sttInputOutputIndexAtom);
  const sttInputTxHash = useAtomValue(sttInputTxHashAtom);
  const sttOutputAssets = useAtomValue(sttOutputAssetsAtom);
  const sttProofOfLifeOverrideMode = useAtomValue(sttProofOfLifeOverrideModeAtom);
  const sttProofOfLifeSpecificDateTime = useAtomValue(sttProofOfLifeSpecificDateTimeAtom);
  const sttStateForm = useAtomValue(sttStateFormAtom);
  const sttWalletInputs = useAtomValue(sttWalletInputsAtom);
  const sttWalletOutputs = useAtomValue(sttWalletOutputsAtom);
  const sttZeroAdminConfirmed = useAtomValue(sttZeroAdminConfirmedAtom);
  const walletOperatorPath = useAtomValue(walletOperatorPathAtom);
  const walletSpendInputHash = useAtomValue(walletSpendInputHashAtom);
  const walletSpendInputIndex = useAtomValue(walletSpendInputIndexAtom);
  const walletSpendOutputs = useAtomValue(walletSpendOutputsAtom);
  const walletSpendRedeemerPreset = useAtomValue(walletSpendRedeemerPresetAtom);
  const withdrawAmount = useAtomValue(withdrawAmountAtom);
  const withdrawRewardAddress = useAtomValue(withdrawRewardAddressAtom);
  const withdrawSttAssets = useAtomValue(withdrawSttAssetsAtom);
  const withdrawSttInputHash = useAtomValue(withdrawSttInputHashAtom);
  const withdrawSttInputIndex = useAtomValue(withdrawSttInputIndexAtom);
  const withdrawSttStateForm = useAtomValue(withdrawSttStateFormAtom);
  const withdrawZeroAdminConfirmed = useAtomValue(withdrawZeroAdminConfirmedAtom);

  return useMemo(
    () => computeActionFieldErrors({
        activeInferredSttStateForm,
        activePaymentKeyHash,
        consolidateAuthorityPath,
        consolidateSttAssets,
        consolidateSttInputHash,
        consolidateSttInputIndex,
        consolidateWalletInputs,
        consolidateWalletOutputs,
        existingWalletNames,
        lockFundsAssets,
        mintStarterAssets,
        mintStateForm,
        mintZeroAdminConfirmed,
        voteJson,
        voteSttAssets,
        voteSttInputHash,
        voteSttInputIndex,
        voteSttStateForm,
        voteZeroAdminConfirmed,
        publishCertificateJson,
        publishSttAssets,
        publishSttInputHash,
        publishSttInputIndex,
        publishSttStateForm,
        publishZeroAdminConfirmed,
        selectedDetectedToken,
        selectedDetectedTokenStateForm,
        streamingPaymentPayoutRows,
        streamingPaymentPayoutTransfers,
        sttAuthorityPath,
        sttExtraTransfers,
        sttInputOutputIndex,
        sttInputTxHash,
        sttOutputAssets,
        sttProofOfLifeOverrideMode,
        sttProofOfLifeSpecificDateTime,
        sttStateForm,
        sttWalletInputs,
        sttWalletOutputs,
        sttZeroAdminConfirmed,
        useAllowancePreview,
        walletOperatorPath,
        walletSpendInputHash,
        walletSpendInputIndex,
        walletSpendOutputs,
        walletSpendRedeemerPreset,
        withdrawAmount,
        withdrawRewardAddress,
        withdrawSttAssets,
        withdrawSttInputHash,
        withdrawSttInputIndex,
        withdrawSttStateForm,
        withdrawZeroAdminConfirmed }),
    [
    activeInferredSttStateForm,
    activePaymentKeyHash,
    consolidateAuthorityPath,
    consolidateSttAssets,
    consolidateSttInputHash,
    consolidateSttInputIndex,
    consolidateWalletInputs,
    consolidateWalletOutputs,
    existingWalletNames,
    lockFundsAssets,
    mintStarterAssets,
    mintStateForm,
    mintZeroAdminConfirmed,
    voteJson,
    voteSttAssets,
    voteSttInputHash,
    voteSttInputIndex,
    voteSttStateForm,
    voteZeroAdminConfirmed,
    publishCertificateJson,
    publishSttAssets,
    publishSttInputHash,
    publishSttInputIndex,
    publishSttStateForm,
    publishZeroAdminConfirmed,
    selectedDetectedToken,
    selectedDetectedTokenStateForm,
    streamingPaymentPayoutRows,
    streamingPaymentPayoutTransfers,
    sttAuthorityPath,
    sttExtraTransfers,
    sttInputOutputIndex,
    sttInputTxHash,
    sttOutputAssets,
    sttProofOfLifeOverrideMode,
    sttProofOfLifeSpecificDateTime,
    sttStateForm,
    sttWalletInputs,
    sttWalletOutputs,
    sttZeroAdminConfirmed,
    useAllowancePreview,
    walletOperatorPath,
    walletSpendInputHash,
    walletSpendInputIndex,
    walletSpendOutputs,
    walletSpendRedeemerPreset,
    withdrawAmount,
    withdrawRewardAddress,
    withdrawSttAssets,
    withdrawSttInputHash,
    withdrawSttInputIndex,
    withdrawSttStateForm,
    withdrawZeroAdminConfirmed
  ]);
}
