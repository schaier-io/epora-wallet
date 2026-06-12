"use client";

import { useAtom } from "jotai";
import { sttInputTxHashAtom, sttInputOutputIndexAtom, sttStateFormAtom, sttZeroAdminConfirmedAtom, sttOutputAssetsAtom, sttWalletInputsAtom, sttWalletOutputsAtom, sttExtraTransfersAtom, sttProofOfLifeOverrideModeAtom, sttProofOfLifeSpecificDateTimeAtom, sttTransferAddressAtom, sttTransferAmountsAtom, streamingPaymentPayoutAmountsAtom, selectedSttActionAtom, sttAuthorityPathAtom, consolidateAuthorityPathAtom, walletOperatorPathAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";

/**
 * Form state for the STT-spend composer (the use/renew/update/manage/allowance/beneficiary/payout/consolidate spend of an existing wallet).
 */
export function useSttSpendForm() {
  const [sttInputTxHash, setSttInputTxHash] = useAtom(sttInputTxHashAtom);
  const [sttInputOutputIndex, setSttInputOutputIndex] = useAtom(sttInputOutputIndexAtom);
  const [sttStateForm, setSttStateForm] = useAtom(sttStateFormAtom);
  const [sttZeroAdminConfirmed, setSttZeroAdminConfirmed] = useAtom(sttZeroAdminConfirmedAtom);
  const [sttOutputAssets, setSttOutputAssets] = useAtom(sttOutputAssetsAtom);
  const [sttWalletInputs, setSttWalletInputs] = useAtom(sttWalletInputsAtom);
  const [sttWalletOutputs, setSttWalletOutputs] = useAtom(sttWalletOutputsAtom);
  const [sttExtraTransfers, setSttExtraTransfers] = useAtom(sttExtraTransfersAtom);
  const [sttProofOfLifeOverrideMode, setSttProofOfLifeOverrideMode] = useAtom(sttProofOfLifeOverrideModeAtom);
  const [sttProofOfLifeSpecificDateTime, setSttProofOfLifeSpecificDateTime] = useAtom(sttProofOfLifeSpecificDateTimeAtom);
  const [sttTransferAddress, setSttTransferAddress] = useAtom(sttTransferAddressAtom);
  const [sttTransferAmounts, setSttTransferAmounts] = useAtom(sttTransferAmountsAtom);
  const [streamingPaymentPayoutAmounts, setStreamingPaymentPayoutAmounts] = useAtom(streamingPaymentPayoutAmountsAtom);
  const [selectedSttAction, setSelectedSttAction] = useAtom(selectedSttActionAtom);
  const [sttAuthorityPath, setSttAuthorityPath] = useAtom(sttAuthorityPathAtom);
  const [consolidateAuthorityPath, setConsolidateAuthorityPath] = useAtom(consolidateAuthorityPathAtom);
  const [walletOperatorPath, setWalletOperatorPath] = useAtom(walletOperatorPathAtom);

  return {
    sttInputTxHash,
    setSttInputTxHash,
    sttInputOutputIndex,
    setSttInputOutputIndex,
    sttStateForm,
    setSttStateForm,
    sttZeroAdminConfirmed,
    setSttZeroAdminConfirmed,
    sttOutputAssets,
    setSttOutputAssets,
    sttWalletInputs,
    setSttWalletInputs,
    sttWalletOutputs,
    setSttWalletOutputs,
    sttExtraTransfers,
    setSttExtraTransfers,
    sttProofOfLifeOverrideMode,
    setSttProofOfLifeOverrideMode,
    sttProofOfLifeSpecificDateTime,
    setSttProofOfLifeSpecificDateTime,
    sttTransferAddress,
    setSttTransferAddress,
    sttTransferAmounts,
    setSttTransferAmounts,
    streamingPaymentPayoutAmounts,
    setStreamingPaymentPayoutAmounts,
    selectedSttAction,
    setSelectedSttAction,
    sttAuthorityPath,
    setSttAuthorityPath,
    consolidateAuthorityPath,
    setConsolidateAuthorityPath,
    walletOperatorPath,
    setWalletOperatorPath
  };
}
