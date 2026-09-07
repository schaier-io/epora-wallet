import { FIELD_ERROR_IDS } from "@/components/user/workspace/field-error-ids";

type FieldErrorLabelKey =
  | "fieldAdvancedOptions"
  | "fieldAssetsToLock"
  | "fieldCertificateJson"
  | "fieldConnectedSigner"
  | "fieldDestinations"
  | "fieldForm"
  | "fieldNoDirectOwner"
  | "fieldOutputAssets"
  | "fieldOutputState"
  | "fieldRecipients"
  | "fieldRecoveryWithdrawal"
  | "fieldResultingFundPools"
  | "fieldScheduledPayment"
  | "fieldScheduledPayments"
  | "fieldSelectedFundPools"
  | "fieldSpecificWakeUpTimerDate"
  | "fieldSpendingAllowance"
  | "fieldStakingAddress"
  | "fieldStarterFunds"
  | "fieldVoteJson"
  | "fieldWakeUpTimer"
  | "fieldWalletIdentity"
  | "fieldWalletInput"
  | "fieldWalletName"
  | "fieldWalletRules"
  | "fieldWalletSettings"
  | "fieldWithdrawalAmount";

type FieldErrorLabelTranslator = (key: FieldErrorLabelKey) => string;

const FIELD_ERROR_LABEL_KEYS: Record<string, FieldErrorLabelKey> = {
  [FIELD_ERROR_IDS.advancedOptions]: "fieldAdvancedOptions",
  [FIELD_ERROR_IDS.assetsToLock]: "fieldAssetsToLock",
  [FIELD_ERROR_IDS.certificateJson]: "fieldCertificateJson",
  [FIELD_ERROR_IDS.consolidation]: "fieldSelectedFundPools",
  [FIELD_ERROR_IDS.connectedSigner]: "fieldConnectedSigner",
  [FIELD_ERROR_IDS.destinations]: "fieldDestinations",
  [FIELD_ERROR_IDS.noDirectOwner]: "fieldNoDirectOwner",
  [FIELD_ERROR_IDS.outputAssets]: "fieldOutputAssets",
  [FIELD_ERROR_IDS.outputState]: "fieldOutputState",
  [FIELD_ERROR_IDS.outputs]: "fieldDestinations",
  [FIELD_ERROR_IDS.publish]: "fieldCertificateJson",
  [FIELD_ERROR_IDS.recipients]: "fieldRecipients",
  [FIELD_ERROR_IDS.recoveryWithdrawal]: "fieldRecoveryWithdrawal",
  [FIELD_ERROR_IDS.resultingFundPools]: "fieldResultingFundPools",
  [FIELD_ERROR_IDS.scheduledPaymentPayout]: "fieldScheduledPayments",
  [FIELD_ERROR_IDS.scheduledPayments]: "fieldScheduledPayments",
  [FIELD_ERROR_IDS.selectedFundPools]: "fieldSelectedFundPools",
  [FIELD_ERROR_IDS.specificWakeUpTimerDate]: "fieldSpecificWakeUpTimerDate",
  [FIELD_ERROR_IDS.spendingAllowance]: "fieldSpendingAllowance",
  [FIELD_ERROR_IDS.stakingAddress]: "fieldStakingAddress",
  [FIELD_ERROR_IDS.starterFunds]: "fieldStarterFunds",
  [FIELD_ERROR_IDS.vote]: "fieldVoteJson",
  [FIELD_ERROR_IDS.voteJson]: "fieldVoteJson",
  [FIELD_ERROR_IDS.wakeUpTimer]: "fieldWakeUpTimer",
  [FIELD_ERROR_IDS.wakeUpTimerRenewal]: "fieldWakeUpTimer",
  [FIELD_ERROR_IDS.walletAfterSend]: "fieldWalletSettings",
  [FIELD_ERROR_IDS.walletIdentityOutputIndex]: "fieldWalletIdentity",
  [FIELD_ERROR_IDS.walletIdentityTransactionHash]: "fieldWalletIdentity",
  [FIELD_ERROR_IDS.walletInputIndex]: "fieldWalletInput",
  [FIELD_ERROR_IDS.walletInputTransactionHash]: "fieldWalletInput",
  [FIELD_ERROR_IDS.walletName]: "fieldWalletName",
  [FIELD_ERROR_IDS.walletRules]: "fieldWalletRules",
  [FIELD_ERROR_IDS.walletSettings]: "fieldWalletSettings",
  [FIELD_ERROR_IDS.withdrawalAmount]: "fieldWithdrawalAmount"
};

export function getFieldErrorLabel(fieldId: string, i18n: FieldErrorLabelTranslator) {
  if (fieldId.startsWith("scheduledPayment:")) {
    return i18n("fieldScheduledPayment");
  }

  const key = FIELD_ERROR_LABEL_KEYS[fieldId];
  return key ? i18n(key) : i18n("fieldForm");
}
