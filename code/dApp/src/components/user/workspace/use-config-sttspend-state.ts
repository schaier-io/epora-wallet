"use client";
import { stagedSttTransfersAtom } from "./atoms/forms/stt-spend-form.atoms";
// State-acquisition hook for SttSpendConfigView: performs every atom
// subscription and form-hook read the view needs and returns them as one
// named object, keeping the view itself presentation-only.
import { availableLockedTransferAssetOptionsAtom, availableLockedTransferAssetsAtom, selectedTransferAssetAtom, streamingPaymentPayoutRowsAtom, streamingPaymentPayoutTransfersAtom } from "@/components/user/workspace/atoms/workspace-transfer-derivations.atoms";
import { recentRecipientsAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { availableWizardActionsAtom, effectiveWalletAssetNameHexAtom, selectedDetectedTokenAtom, selectedDetectedTokenStateFormAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { resolvedSelectedTaskAtom, selectedActionAtom, selectedIntentAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { activeSttActionTabAtom, activeSttAuthorityOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { useAllowancePreviewAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";

import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { safeStringify } from "@/components/user/workspace/helpers";
import { activeSubmitAtom, submitHashAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { streamingPaymentPayoutAmountsAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
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
  const sendAuthorizationOptions = useAtomValue(availableWizardActionsAtom).filter(
    ({ kind }) => kind === "use" || kind === "use-allowance" || kind === "use-beneficiary"
  );
  const useAllowancePreview = useAtomValue(useAllowancePreviewAtom);
  const config = useAtomValue(configAtom);
  const {
    activeFieldErrors,
    addSimpleTransferRecipient,
    dismissSubmitState,
    flowAvailability,
    guidedStreamingPaymentTaskBadges,
    guidedStreamingPaymentsDisabledTasks,
    handleFocusedTaskSelect,
    openWorkspaceIntent
  } = state;
  // Read straight from the atoms, the way the review rail does: the controller's
  // return surface carries neither, and the retirement only needs the facts.
  const submitHash = useAtomValue(submitHashAtom);
  const activeSubmit = useAtomValue(activeSubmitAtom);
  const { consolidateAuthorityPath, setConsolidateAuthorityPath, setStreamingPaymentPayoutAmounts, setSttAuthorityPath, setSttExtraTransfers, setSttStateForm, setSttZeroAdminConfirmed, sttAuthorityPath, sttStateForm, sttWalletInputs, sttZeroAdminConfirmed } = useSttSpendForm();
  const stagedTransfers = useAtomValue(stagedSttTransfersAtom);
  const streamingPaymentPayoutAmounts = useAtomValue(streamingPaymentPayoutAmountsAtom);
  const { setTransferCustomAddress, setTransferDisplayAmount, setTransferRecipientMode, setTransferSelectedUnit, transferCustomAddress, transferDisplayAmount, transferRecipientMode, transferSelectedUnit } = useTransferForm();

  // The submitted-transaction receipt ("Submitted/Confirmed" + hash) describes a
  // COMPLETED transaction. Nothing retired it when the reader went on to stage
  // the next one, so a confirmed send kept sitting over a form that now staged a
  // different one.
  //
  // The retirement is a signature watcher, not wrapped setters. Wrapping was
  // tried first and was wrong twice over: a fresh closure per render made the
  // auto-apply authority effect (config-sttspend-view.tsx) re-fire on every
  // render and dismiss the receipt the moment a submit landed, and the staging
  // buttons (`addSimpleTransferRecipient`, `updateSttTransferAmount`) write
  // through `useSetAtom` and would have bypassed any wrapper. The signature
  // covers only the composer's own form atoms, so programmatic writers outside
  // them (draft resets, wallet seeding, navigation) stay invisible, and a
  // same-value programmatic write changes nothing.
  //
  // The baseline re-arms whenever the hash itself changes, which also swallows
  // the post-submit draft resets (`clear-payouts`, `resetTransferFormAtom`):
  // they run as microtasks, before the re-baselining effect commits, so the
  // baseline already reflects the cleared form. The `!activeSubmit` gate keeps
  // the promise that an edit while a tx is confirming leaves the banner alone.
  // Navigation between actions already clears through `clearBuildMessages`.
  // Editors outside this hook (withdraw, vote, publish, the advanced fund-pool
  // boxes) keep the manual "Done" acknowledgement.
  // `safeStringify`, not raw JSON.stringify: the state form carries datum
  // sections whose integers can be bigint, which JSON.stringify throws on.
  const editSignature = safeStringify({
    transferRecipientMode,
    transferCustomAddress,
    transferDisplayAmount,
    transferSelectedUnit,
    stagedTransfers,
    streamingPaymentPayoutAmounts,
    sttStateForm,
    sttAuthorityPath,
    sttZeroAdminConfirmed
  });
  const editBaselineRef = useRef<string | null>(null);
  useEffect(() => {
    editBaselineRef.current = null;
  }, [submitHash]);
  useEffect(() => {
    if (editBaselineRef.current === null) {
      editBaselineRef.current = editSignature;
      return;
    }
    if (editSignature !== editBaselineRef.current && submitHash && !activeSubmit) {
      dismissSubmitState();
    }
    editBaselineRef.current = editSignature;
  });

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
    sendAuthorizationOptions,
    useAllowancePreview,
    config,
    activeFieldErrors,
    addSimpleTransferRecipient,
    flowAvailability,
    guidedStreamingPaymentTaskBadges,
    guidedStreamingPaymentsDisabledTasks,
    handleFocusedTaskSelect,
    openWorkspaceIntent,
    consolidateAuthorityPath,
    setConsolidateAuthorityPath,
    setStreamingPaymentPayoutAmounts,
    setSttAuthorityPath,
    setSttExtraTransfers,
    setSttStateForm,
    setSttZeroAdminConfirmed,
    sttAuthorityPath,
    sttExtraTransfers: stagedTransfers,
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
