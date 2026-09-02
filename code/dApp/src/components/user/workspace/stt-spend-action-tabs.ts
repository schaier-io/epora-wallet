// Per-mode copy and surface flags for the STT spend workspace: one entry per
// action tab (send, update settings, allowance, …). Pure data consumed by the
// sttspend view and its option atoms.
import { type SttSpendActionMode } from "@/components/user/workspace/types";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceSttSpendActionTabs.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceSttSpendActionTabs", defaultMessages);

export const STT_SPEND_ACTION_TABS: Array<{
  value: SttSpendActionMode;
  label: string;
  tabHint: string;
  description: string;
  stateHelper: string;
  outputStateLabel: string;
  outputAssetsHelper: string;
  showOutputAssets: boolean;
  lockedInputsHelper: string;
  lockedInputsLabel: string;
  lockedInputsEditorLabel: string;
  lockedInputsEditorHelper: string;
  lockedOutputsHelper: string;
  lockedOutputsLabel: string;
  showTransfers: boolean;
  transfersHelper: string;
  transferSelectorHelper: string;
  showProofOfLifeOverride: boolean;
  allowsStateEditing: boolean;
  /** When false, only the manual ref editor is shown (no locking-address + refresh + UTxO list). */
  showLockedContractUtxoBrowser: boolean;
  /** When false, the address + range "Quick transfer builder" strip is hidden. */
  showQuickTransferBuilder: boolean;
  buildLabel: string;
}> = [
  {
    value: "use",
    label: i18n("sendFunds"),
    tabHint: i18n("sendTabHint"),
    description:
      i18n("sendFundsFromThisWalletWithoutChangingIts_dfe39a"),
    stateHelper:
      i18n("sendStateHelper"),
    outputStateLabel: i18n("outputStateUpdated"),
    outputAssetsHelper:
      i18n("outputAssetsKeepAll"),
    showOutputAssets: true,
    lockedInputsHelper:
      i18n("sendLockedInputsHelper"),
    lockedInputsLabel: i18n("lockedInputsFundPools"),
    lockedInputsEditorLabel: i18n("lockedInputsEditorFundPools"),
    lockedInputsEditorHelper:
      i18n("lockedInputsEditorAddOrPick"),
    lockedOutputsHelper:
      i18n("lockedOutputsSentHere"),
    lockedOutputsLabel: i18n("lockedOutputsStaysInWallet"),
    showTransfers: true,
    transfersHelper:
      i18n("sendTransfersHelper"),
    transferSelectorHelper:
      i18n("selectorPickWhichFundPools"),
    showProofOfLifeOverride: true,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: i18n("buildPreviewSend")
  },
  {
    value: "renew-proof-of-life",
    label: i18n("refreshProofOfLife"),
    tabHint: i18n("renewProofOfLifeTabHint"),
    description:
      i18n("refreshTheWalletProofOfLifeWithoutSending"),
    stateHelper:
      i18n("renewProofOfLifeStateHelper"),
    outputStateLabel: i18n("outputStateUpdated"),
    outputAssetsHelper:
      i18n("outputAssetsNothingLeaves"),
    showOutputAssets: false,
    lockedInputsHelper:
      i18n("renewProofOfLifeLockedInputsHelper"),
    lockedInputsLabel: i18n("lockedInputsFundPools"),
    lockedInputsEditorLabel: i18n("lockedInputsEditorFundPools"),
    lockedInputsEditorHelper:
      i18n("lockedInputsEditorLeaveEmptyTimer"),
    lockedOutputsHelper:
      i18n("lockedOutputsNothingUnlocked"),
    lockedOutputsLabel: i18n("lockedOutputsStaysInWallet"),
    showTransfers: false,
    transfersHelper:
      i18n("renewProofOfLifeTransfersHelper"),
    transferSelectorHelper:
      i18n("selectorNotUsed"),
    showProofOfLifeOverride: true,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: false,
    showQuickTransferBuilder: true,
    buildLabel: i18n("buildPreviewTimerRenewal")
  },
  {
    value: "update-state",
    label: i18n("updateSettings"),
    tabHint: i18n("updateStateTabHint"),
    description:
      i18n("changePeopleApprovalsRecoveryContactsOrOtherWallet"),
    stateHelper:
      i18n("updateStateStateHelper"),
    outputStateLabel: i18n("outputStateNew"),
    outputAssetsHelper:
      i18n("outputAssetsKeepAll"),
    showOutputAssets: true,
    lockedInputsHelper:
      i18n("updateStateLockedInputsHelper"),
    lockedInputsLabel: i18n("lockedInputsFundPools"),
    lockedInputsEditorLabel: i18n("lockedInputsEditorFundPools"),
    lockedInputsEditorHelper:
      i18n("lockedInputsEditorAddEach"),
    lockedOutputsHelper:
      i18n("lockedOutputsNotSent"),
    lockedOutputsLabel: i18n("lockedOutputsStaysInWallet"),
    showTransfers: true,
    transfersHelper:
      i18n("updateStateTransfersHelper"),
    transferSelectorHelper:
      i18n("selectorPickFundPools"),
    showProofOfLifeOverride: false,
    allowsStateEditing: true,
    showLockedContractUtxoBrowser: false,
    showQuickTransferBuilder: false,
    buildLabel: i18n("buildPreviewSettingsUpdate")
  },
  {
    value: "manage-streaming-payments",
    label: i18n("manageScheduledPayments"),
    tabHint: i18n("manageScheduledPaymentsTabHint"),
    description:
      i18n("addOrUpdateScheduledPaymentsWhileLeavingOther"),
    stateHelper:
      i18n("manageScheduledPaymentsStateHelper"),
    outputStateLabel: i18n("outputStateNew"),
    outputAssetsHelper:
      i18n("outputAssetsKeepAll"),
    showOutputAssets: true,
    lockedInputsHelper:
      i18n("manageScheduledPaymentsLockedInputsHelper"),
    lockedInputsLabel: i18n("lockedInputsFundPools"),
    lockedInputsEditorLabel: i18n("lockedInputsEditorFundPools"),
    lockedInputsEditorHelper:
      i18n("lockedInputsEditorAddEach"),
    lockedOutputsHelper:
      i18n("lockedOutputsNotSent"),
    lockedOutputsLabel: i18n("lockedOutputsStaysInWallet"),
    showTransfers: true,
    transfersHelper:
      i18n("manageScheduledPaymentsTransfersHelper"),
    transferSelectorHelper:
      i18n("selectorPickFundPools"),
    showProofOfLifeOverride: false,
    allowsStateEditing: true,
    showLockedContractUtxoBrowser: false,
    showQuickTransferBuilder: false,
    buildLabel: i18n("buildPreviewScheduledPaymentChanges")
  },
  {
    value: "use-allowance",
    label: i18n("useAllowance"),
    tabHint: i18n("useAllowanceTabHint"),
    description:
      i18n("sendFundsWithinTheAllowanceConfiguredForThe"),
    stateHelper:
      i18n("useAllowanceStateHelper"),
    outputStateLabel: i18n("outputStateUpdated"),
    outputAssetsHelper:
      i18n("outputAssetsAllowanceCounts"),
    showOutputAssets: false,
    lockedInputsHelper:
      i18n("useAllowanceLockedInputsHelper"),
    lockedInputsLabel: i18n("lockedInputsFundPools"),
    lockedInputsEditorLabel: i18n("lockedInputsEditorFundPools"),
    lockedInputsEditorHelper:
      i18n("lockedInputsEditorAddOrPick"),
    lockedOutputsHelper:
      i18n("lockedOutputsLeftoverChosen"),
    lockedOutputsLabel: i18n("lockedOutputsStaysInWallet"),
    showTransfers: true,
    transfersHelper:
      i18n("useAllowanceTransfersHelper"),
    transferSelectorHelper:
      i18n("selectorPickFundPools"),
    showProofOfLifeOverride: false,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: i18n("buildPreviewAllowanceSend")
  },
  {
    value: "use-beneficiary",
    label: i18n("spendAsRecoveryContact"),
    tabHint: i18n("useBeneficiaryTabHint"),
    description:
      i18n("spendAsARecoveryContactOnceTheWallet"),
    stateHelper:
      i18n("useBeneficiaryStateHelper"),
    outputStateLabel: i18n("outputStateUpdated"),
    outputAssetsHelper:
      i18n("outputAssetsOnlyAdaLeaves"),
    showOutputAssets: true,
    lockedInputsHelper:
      i18n("useBeneficiaryLockedInputsHelper"),
    lockedInputsLabel: i18n("lockedInputsFundPools"),
    lockedInputsEditorLabel: i18n("lockedInputsEditorFundPools"),
    lockedInputsEditorHelper:
      i18n("lockedInputsEditorAddOrPick"),
    lockedOutputsHelper:
      i18n("lockedOutputsLeftover"),
    lockedOutputsLabel: i18n("lockedOutputsStaysInWallet"),
    showTransfers: true,
    transfersHelper:
      i18n("useBeneficiaryTransfersHelper"),
    transferSelectorHelper:
      i18n("selectorPickFundPools"),
    showProofOfLifeOverride: false,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: i18n("buildPreviewRecoveryPayment")
  },
  {
    value: "payout-streaming-payment",
    label: i18n("payScheduledPayments"),
    tabHint: i18n("payoutScheduledPaymentTabHint"),
    description:
      i18n("sendAScheduledPaymentThatSDueThen"),
    stateHelper:
      i18n("payoutScheduledPaymentStateHelper"),
    outputStateLabel: i18n("outputStateUpdated"),
    outputAssetsHelper:
      i18n("outputAssetsScheduleAdaOnly"),
    showOutputAssets: true,
    lockedInputsHelper:
      i18n("payoutScheduledPaymentLockedInputsHelper"),
    lockedInputsLabel: i18n("lockedInputsFundPools"),
    lockedInputsEditorLabel: i18n("lockedInputsEditorFundPools"),
    lockedInputsEditorHelper:
      i18n("lockedInputsEditorPayoutSource"),
    lockedOutputsHelper:
      i18n("lockedOutputsLeftoverChosen"),
    lockedOutputsLabel: i18n("lockedOutputsStaysInWallet"),
    showTransfers: true,
    transfersHelper:
      i18n("payoutScheduledPaymentTransfersHelper"),
    transferSelectorHelper:
      i18n("selectorOptionalForPayouts"),
    showProofOfLifeOverride: false,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: i18n("buildPreviewScheduledPayment")
  },
  {
    value: "consolidate-utxo",
    label: i18n("tidyFunds"),
    tabHint: i18n("tidyFundsTabHint"),
    description:
      i18n("mergeSeveralSmallFundPoolsIntoASimpler"),
    stateHelper:
      i18n("tidyFundsStateHelper"),
    outputStateLabel: i18n("outputStateUpdated"),
    outputAssetsHelper:
      i18n("outputAssetsFewerPools"),
    showOutputAssets: false,
    // "at least two" was wrong in both places. `action-validation.ts:238-243` validates this
    // list with a minimum of 1, and `lib/mesh/transactions/consolidate-utxos.ts:19` rejects
    // only `length < 1`, because a single pool is the orphan-sweep case, which is what the
    // wallet-home "Move it back" button runs. The form said two while the validator under it
    // said one.
    lockedInputsHelper:
      i18n("tidyFundsLockedInputsHelper"),
    lockedInputsLabel: i18n("lockedInputsChooseFundPools"),
    // Rendered by `editors/asset-editors.tsx:306` as "Advanced: <label lowercased>", directly
    // under the picker above. Both used to be "Fund pools", so one screen carried two
    // identically named controls that do different things.
    lockedInputsEditorLabel: i18n("lockedInputsEditorFundPoolsNotListed"),
    lockedInputsEditorHelper:
      i18n("lockedInputsEditorPasteRef"),
    lockedOutputsHelper:
      i18n("lockedOutputsMergedOrCustom"),
    lockedOutputsLabel: i18n("lockedOutputsMergedFundPools"),
    showTransfers: false,
    transfersHelper:
      i18n("tidyFundsTransfersHelper"),
    transferSelectorHelper:
      i18n("selectorOnlyReorganizes"),
    showProofOfLifeOverride: false,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: i18n("buildPreviewTidyFunds")
  }
];
