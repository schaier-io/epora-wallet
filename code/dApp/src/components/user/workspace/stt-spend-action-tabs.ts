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
    tabHint: i18n("ownerOrSharedApproval"),
    description:
      i18n("sendFundsFromThisWalletWithoutChangingIts"),
    stateHelper:
      i18n("thePaymentMovesFundsPeopleLimitsAndSchedules"),
    outputStateLabel: i18n("walletAfterTheSend"),
    outputAssetsHelper:
      i18n("leaveEmptyToKeepAllCurrentAssetsIn"),
    showOutputAssets: true,
    lockedInputsHelper:
      i18n("optionalFundPoolsToSpendFromOnThis"),
    lockedInputsLabel: i18n("walletFunds"),
    lockedInputsEditorLabel: i18n("walletFunds"),
    lockedInputsEditorHelper:
      i18n("chooseFromTheLoadedFundPoolsOrEnter"),
    lockedOutputsHelper:
      i18n("anyUnspentValueFromTheSelectedFundPools"),
    lockedOutputsLabel: i18n("staysInWallet"),
    showTransfers: true,
    transfersHelper:
      i18n("addEachRecipientHereAnythingNotSentRemains"),
    transferSelectorHelper:
      i18n("pickWhichFundPoolsToSpendFromOne"),
    showProofOfLifeOverride: true,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: i18n("previewSend")
  },
  {
    value: "renew-proof-of-life",
    label: i18n("refreshWakeUpTimer"),
    tabHint: i18n("delayRecoveryWithdrawals"),
    description:
      i18n("refreshTheWalletWakeUpTimerWithoutSending"),
    stateHelper:
      i18n("theRecoveryDateMovesForwardWithinTheAllowed"),
    outputStateLabel: i18n("walletAfterTheRefresh"),
    outputAssetsHelper:
      i18n("noAssetsChangeHands"),
    showOutputAssets: false,
    lockedInputsHelper:
      i18n("leaveEmptyRefreshingTheTimerDoesnTTouch"),
    lockedInputsLabel: i18n("walletFunds"),
    lockedInputsEditorLabel: i18n("walletFunds"),
    lockedInputsEditorHelper:
      i18n("leaveEmptyOnlyTheTimerIsUpdated"),
    lockedOutputsHelper:
      i18n("noFundPoolIsCreatedOrChanged"),
    lockedOutputsLabel: i18n("staysInWallet"),
    showTransfers: false,
    transfersHelper:
      i18n("noPaymentsAreMade"),
    transferSelectorHelper:
      i18n("thereAreNoRecipientsForATimerRefresh"),
    showProofOfLifeOverride: true,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: false,
    showQuickTransferBuilder: true,
    buildLabel: i18n("previewTimerRefresh")
  },
  {
    value: "update-state",
    label: i18n("updateSettings"),
    tabHint: i18n("peopleAndWalletRules"),
    description:
      i18n("changePeopleApprovalsRecoveryContactsOrOtherWallet"),
    stateHelper:
      i18n("reviewTheFullResultCarefullyTheseSettingsReplace"),
    outputStateLabel: i18n("walletAfterTheUpdate"),
    outputAssetsHelper:
      i18n("leaveEmptyToKeepAllCurrentAssetsIn"),
    showOutputAssets: true,
    lockedInputsHelper:
      i18n("optionalFundPoolsToTouchDuringThisUpdate"),
    lockedInputsLabel: i18n("walletFunds"),
    lockedInputsEditorLabel: i18n("walletFunds"),
    lockedInputsEditorHelper:
      i18n("addATransactionReferenceAndOutputIndexFor"),
    lockedOutputsHelper:
      i18n("anyUnspentValueFromTheSelectedFundPools"),
    lockedOutputsLabel: i18n("staysInWallet"),
    showTransfers: true,
    transfersHelper:
      i18n("ifYouAlsoWantToMoveFundsDuring"),
    transferSelectorHelper:
      i18n("pickFundPoolsOneSliderPerAsset"),
    showProofOfLifeOverride: false,
    allowsStateEditing: true,
    showLockedContractUtxoBrowser: false,
    showQuickTransferBuilder: false,
    buildLabel: i18n("previewSettingsUpdate")
  },
  {
    value: "manage-streaming-payments",
    label: i18n("manageScheduledPayments"),
    tabHint: i18n("scheduledPayments"),
    description:
      i18n("addOrUpdateScheduledPaymentRulesWhileLeaving"),
    stateHelper:
      i18n("onlySchedulesChangePeopleLimitsAndRecoverySettings"),
    outputStateLabel: i18n("walletAfterTheScheduleUpdate"),
    outputAssetsHelper:
      i18n("leaveEmptyToKeepAllCurrentAssetsIn"),
    showOutputAssets: true,
    lockedInputsHelper:
      i18n("optionalFundPoolsToTouchWhileChangingThe"),
    lockedInputsLabel: i18n("walletFunds"),
    lockedInputsEditorLabel: i18n("walletFunds"),
    lockedInputsEditorHelper:
      i18n("addATransactionReferenceAndOutputIndexFor"),
    lockedOutputsHelper:
      i18n("anyUnspentValueFromTheSelectedFundPools"),
    lockedOutputsLabel: i18n("staysInWallet"),
    showTransfers: true,
    transfersHelper:
      i18n("ifYouAlsoWantToSendFundsDuring"),
    transferSelectorHelper:
      i18n("pickFundPoolsOneSliderPerAsset"),
    showProofOfLifeOverride: false,
    allowsStateEditing: true,
    showLockedContractUtxoBrowser: false,
    showQuickTransferBuilder: false,
    buildLabel: i18n("previewScheduledPaymentChanges")
  },
  {
    value: "use-allowance",
    label: i18n("useAllowance"),
    tabHint: i18n("spendWithinALimit"),
    description:
      i18n("sendFundsWithinTheAllowanceConfiguredForThe"),
    stateHelper:
      i18n("thePaymentMovesFundsAndReducesYourRemaining"),
    outputStateLabel: i18n("walletAfterTheSend"),
    outputAssetsHelper:
      i18n("nothingElseMovesTheAmountYouSendCounts"),
    showOutputAssets: false,
    lockedInputsHelper:
      i18n("pickTheFundPoolsYouWantToSpend"),
    lockedInputsLabel: i18n("walletFunds"),
    lockedInputsEditorLabel: i18n("walletFunds"),
    lockedInputsEditorHelper:
      i18n("chooseFromTheLoadedFundPoolsOrEnter"),
    lockedOutputsHelper:
      i18n("anythingLeftInTheSelectedFundPoolsRemains"),
    lockedOutputsLabel: i18n("staysInWallet"),
    showTransfers: true,
    transfersHelper:
      i18n("recipientsOfThisSendTheTotalCountsAgainst"),
    transferSelectorHelper:
      i18n("pickFundPoolsOneSliderPerAsset"),
    showProofOfLifeOverride: false,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: i18n("previewAllowanceSend")
  },
  {
    value: "use-beneficiary",
    label: i18n("withdrawRecoveryShare"),
    tabHint: i18n("oneTimeRecoveryWithdrawal"),
    description:
      i18n("afterTheTimerExpiresWithdrawUpToThis"),
    stateHelper:
      i18n("theRecoveryContactIsRemovedFromThisWallet"),
    outputStateLabel: i18n("walletAfterTheWithdrawal"),
    outputAssetsHelper:
      i18n("chooseAdaAndNativeAssetsWithinThisContact"),
    showOutputAssets: true,
    lockedInputsHelper:
      i18n("pickTheFundPoolsToSpendFrom"),
    lockedInputsLabel: i18n("walletFunds"),
    lockedInputsEditorLabel: i18n("walletFunds"),
    lockedInputsEditorHelper:
      i18n("chooseFromTheLoadedFundPoolsOrEnter"),
    lockedOutputsHelper:
      i18n("anythingOutsideThisWithdrawalRemainsInTheWallet"),
    lockedOutputsLabel: i18n("staysInWallet"),
    showTransfers: true,
    transfersHelper:
      i18n("recipientsOfThisOneTimeRecoveryWithdrawal"),
    transferSelectorHelper:
      i18n("pickFundPoolsOneSliderPerAsset"),
    showProofOfLifeOverride: false,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: i18n("previewRecoveryWithdrawal")
  },
  {
    value: "payout-streaming-payment",
    label: i18n("payScheduledPayments"),
    tabHint: i18n("scheduledRecipientPayout"),
    description:
      i18n("releaseOneOrMoreAmountsThatHaveAccrued"),
    stateHelper:
      i18n("eachPayoutIsAddedToTheMatchingSchedule"),
    outputStateLabel: i18n("walletAfterThePayout"),
    outputAssetsHelper:
      i18n("theScheduledAdaOrNativeAssetIsPaid"),
    showOutputAssets: true,
    lockedInputsHelper:
      i18n("optionalPickWalletFundPoolsOrLeaveEmpty"),
    lockedInputsLabel: i18n("walletFunds"),
    lockedInputsEditorLabel: i18n("walletFunds"),
    lockedInputsEditorHelper:
      i18n("leaveEmptyToUseTheConnectedWalletOr"),
    lockedOutputsHelper:
      i18n("anythingLeftInTheSelectedFundPoolsRemains"),
    lockedOutputsLabel: i18n("staysInWallet"),
    showTransfers: true,
    transfersHelper:
      i18n("theRecipientsDueToBePaidThisCycle"),
    transferSelectorHelper:
      i18n("walletFundPoolsAreOptionalForScheduledPayouts"),
    showProofOfLifeOverride: false,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: i18n("previewScheduledPaymentPayout")
  },
  {
    value: "consolidate-utxo",
    label: i18n("tidyFunds"),
    tabHint: i18n("mergeFundPools"),
    description:
      i18n("mergeSeveralSmallFundPoolsIntoASimpler"),
    stateHelper:
      i18n("theSameAssetsStayUnderTheSameWallet"),
    outputStateLabel: i18n("walletAfterTidying"),
    outputAssetsHelper:
      i18n("sameAssetsJustFewerPoolsYouCanOptionally"),
    showOutputAssets: false,
    lockedInputsHelper:
      i18n("pickAtLeastTwoFundPoolsToMerge"),
    lockedInputsLabel: i18n("walletFunds"),
    lockedInputsEditorLabel: i18n("walletFunds"),
    lockedInputsEditorHelper:
      i18n("addAtLeastTwoFundPoolsToMerge"),
    lockedOutputsHelper:
      i18n("leaveEmptyToLetTheAppCreateOne"),
    lockedOutputsLabel: i18n("mergedFundPools"),
    showTransfers: false,
    transfersHelper:
      i18n("tidyFundsDoesnTSendToOutsideRecipients"),
    transferSelectorHelper:
      i18n("tidyFundsOnlyReorganizesTheWallet"),
    showProofOfLifeOverride: false,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: i18n("previewTidyFunds")
  }
];
