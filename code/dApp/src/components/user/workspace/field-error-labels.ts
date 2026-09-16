import { FIELD_ERROR_IDS } from "@/components/user/workspace/field-error-ids";

type FieldErrorLabelKey =
  | "fieldAdvancedOptions"
  | "fieldAssetsToLock"
  | "fieldCertificateJson"
  | "fieldConnectedSigner"
  | "fieldDestinations"
  | "fieldDistribution"
  | "fieldForm"
  | "fieldForwardedSttAssets"
  | "fieldForwardedSttState"
  | "fieldLimitedWithdrawal"
  | "fieldNoDirectOwner"
  | "fieldOutputAssets"
  | "fieldOutputState"
  | "fieldPayouts"
  | "fieldRecipients"
  | "fieldRecoveryPreparation"
  | "fieldRecoveryWithdrawal"
  | "fieldResultingFundPools"
  | "fieldScheduledPayment"
  | "fieldScheduledPayments"
  | "fieldSelectedFundPools"
  | "fieldSpecificWakeUpTimerDate"
  | "fieldSpendingAllowance"
  | "fieldStaking"
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

// The validators key `FieldErrors` by the field's default-English label (see
// action-validation.ts, action-validation-shared.ts and action-validation-spend.ts),
// so the review rail receives those strings and this table maps each one back to a
// catalog key. The `FIELD_ERROR_IDS`-spelled entries predate that migration and map
// the stable ids; the plain-English entries map the strings the validators emit.
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
  [FIELD_ERROR_IDS.withdrawalAmount]: "fieldWithdrawalAmount",
  // Default-English keys emitted by the action-validation-*.ts validators. The
  // catalog label is the field's curated name, which may differ from the key.
  "Advanced options": "fieldAdvancedOptions",
  "Assets sent": "fieldOutputAssets",
  "Assets to lock": "fieldAssetsToLock",
  "Certificate JSON": "fieldCertificateJson",
  "Connected wallet key": "fieldConnectedSigner",
  Consolidation: "fieldSelectedFundPools",
  "Exact distribution": "fieldDistribution",
  "Forwarded STT assets": "fieldForwardedSttAssets",
  "Fund pools": "fieldSelectedFundPools",
  "Limited withdrawal": "fieldLimitedWithdrawal",
  "New fund pools": "fieldResultingFundPools",
  "Output assets": "fieldOutputAssets",
  "Output state": "fieldOutputState",
  Payouts: "fieldPayouts",
  "Proof of life renewal": "fieldWakeUpTimer",
  Publish: "fieldCertificateJson",
  "Recovery preparation": "fieldRecoveryPreparation",
  "Scheduled payment": "fieldScheduledPayment",
  "Scheduled payment payout": "fieldScheduledPayments",
  "Specific proof of life date": "fieldSpecificWakeUpTimerDate",
  Staking: "fieldStaking",
  "Staking address": "fieldStakingAddress",
  "Starter funds": "fieldStarterFunds",
  "STT input index": "fieldWalletIdentity",
  "STT input tx hash": "fieldWalletIdentity",
  "Transfers / forwarded outputs": "fieldDestinations",
  Vote: "fieldVoteJson",
  "Vote JSON": "fieldVoteJson",
  "Wallet name": "fieldWalletName",
  "Wallet rules": "fieldWalletRules",
  "Wallet state after": "fieldOutputState",
  "Wallet state to carry forward": "fieldForwardedSttState",
  "Wallet with no owner": "fieldNoDirectOwner",
  "Withdrawal amount": "fieldWithdrawalAmount"
};

export function getFieldErrorLabel(fieldId: string, i18n: FieldErrorLabelTranslator) {
  // Exact matches win first: "Scheduled payment payout" must not be eaten by the
  // per-row prefix below ("Scheduled payment 3", one key per payout row).
  const key =
    FIELD_ERROR_LABEL_KEYS[fieldId] ??
    (fieldId.startsWith("scheduledPayment:") || fieldId.startsWith("Scheduled payment ")
      ? "fieldScheduledPayment"
      : undefined);
  // An unmapped key keeps its raw text: a missing catalog entry must not hide a
  // field error behind the generic "Form" label.
  return key ? i18n(key) : fieldId;
}
