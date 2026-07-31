"use client";
// State-acquisition hook for SttSpendConfigView: performs every atom
// subscription and form-hook read the view needs and returns them as one
// named object, keeping the view itself presentation-only.
import { availableLockedTransferAssetOptionsAtom, availableLockedTransferAssetsAtom, selectedTransferAssetAtom, streamingPaymentPayoutRowsAtom, streamingPaymentPayoutTransfersAtom } from "@/components/user/workspace/atoms/workspace-transfer-derivations.atoms";
import { recentRecipientsAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { effectiveWalletAssetNameHexAtom, selectedDetectedTokenAtom, selectedDetectedTokenStateFormAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { resolvedSelectedTaskAtom, selectedActionAtom, selectedIntentAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { activeSttActionTabAtom, activeSttAuthorityOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { useAllowancePreviewAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";

import { useAtomValue } from "jotai";
import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";
import { useTransferForm } from "@/components/user/workspace/forms/use-transfer-form";

export function useConfigSttSpendState() {
  const state = useWorkspaceActions();
  const availableLockedTransferAssets = useAtomValue(availableLockedTransferAssetsAtom);
  const availableLockedTransferAssetOptions = useAtomValue(availableLockedTransferAssetOptionsAtom);
  const selectedTransferAsset = useAtomValue(selectedTransferAssetAtom);
  const streamingPaymentPayoutRows = useAtomValue(streamingPaymentPayoutRowsAtom);
  const streamingPaymentPayoutTransfers = useAtomValue(streamingPaymentPayoutTransfersAtom);
  const recentRecipients = useAtomValue(recentRecipientsAtom);
  const activeAddress = useAtomValue(activeAddressAtom);
  const activePaymentKeyHash = useAtomValue(activePaymentKeyHashAtom);
  const activeSttActionTab = useAtomValue(activeSttActionTabAtom);
  const activeSttAuthorityOptions = useAtomValue(activeSttAuthorityOptionsAtom);
  const effectiveWalletAssetNameHex = useAtomValue(effectiveWalletAssetNameHexAtom);
  const resolvedSelectedTask = useAtomValue(resolvedSelectedTaskAtom);
  const selectedAction = useAtomValue(selectedActionAtom);
  const selectedDetectedToken = useAtomValue(selectedDetectedTokenAtom);
  const selectedDetectedTokenStateForm = useAtomValue(selectedDetectedTokenStateFormAtom);
  const selectedIntent = useAtomValue(selectedIntentAtom);
  const useAllowancePreview = useAtomValue(useAllowancePreviewAtom);
  const config = useAtomValue(configAtom);
  const {
    activeFieldErrors,
    addSimpleTransferRecipient,
    flowAvailability,
    guidedStreamingPaymentTaskBadges,
    guidedStreamingPaymentsDisabledTasks,
    handleFocusedTaskSelect
  } = state;
  const { consolidateAuthorityPath, setConsolidateAuthorityPath, setStreamingPaymentPayoutAmounts, setSttAuthorityPath, setSttExtraTransfers, setSttStateForm, setSttZeroAdminConfirmed, sttAuthorityPath, sttExtraTransfers, sttStateForm, sttWalletInputs, sttZeroAdminConfirmed } = useSttSpendForm();
  const { setTransferCustomAddress, setTransferDisplayAmount, setTransferRecipientMode, setTransferSelectedUnit, transferCustomAddress, transferDisplayAmount, transferRecipientMode, transferSelectedUnit } = useTransferForm();

  return {
    availableLockedTransferAssets,
    availableLockedTransferAssetOptions,
    selectedTransferAsset,
    streamingPaymentPayoutRows,
    streamingPaymentPayoutTransfers,
    recentRecipients,
    activeAddress,
    activePaymentKeyHash,
    activeSttActionTab,
    activeSttAuthorityOptions,
    effectiveWalletAssetNameHex,
    resolvedSelectedTask,
    selectedAction,
    selectedDetectedToken,
    selectedDetectedTokenStateForm,
    selectedIntent,
    useAllowancePreview,
    config,
    activeFieldErrors,
    addSimpleTransferRecipient,
    flowAvailability,
    guidedStreamingPaymentTaskBadges,
    guidedStreamingPaymentsDisabledTasks,
    handleFocusedTaskSelect,
    consolidateAuthorityPath,
    setConsolidateAuthorityPath,
    setStreamingPaymentPayoutAmounts,
    setSttAuthorityPath,
    setSttExtraTransfers,
    setSttStateForm,
    setSttZeroAdminConfirmed,
    sttAuthorityPath,
    sttExtraTransfers,
    sttStateForm,
    sttWalletInputs,
    sttZeroAdminConfirmed,
    setTransferCustomAddress,
    setTransferDisplayAmount,
    setTransferRecipientMode,
    setTransferSelectedUnit,
    transferCustomAddress,
    transferDisplayAmount,
    transferRecipientMode,
    transferSelectedUnit
  };
}
