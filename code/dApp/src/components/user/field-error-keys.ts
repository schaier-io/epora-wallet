import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserFieldErrorKeys.json";

const i18n = createDefaultTranslator("ComponentsUserFieldErrorKeys", defaultMessages);

/**
 * The identity a field error is filed under, kept apart from the label the reader sees.
 *
 * The two used to be one string. A producer wrote `pushFieldError(errors, "Output state", …)`
 * or `pushFieldError(errors, i18n("outputState"), …)`, and the field editor read it back with
 * `getFirstFieldError(errors, "Output state")`. Those agreed only while the English message
 * happened to equal the literal. It stopped: `i18n("outputState")` now reads "Wallet state
 * after", so the rename refusal was filed under one name and looked up under another, and the
 * inline error under the field silently never appeared. VERIFIED by running both halves:
 * `getFirstFieldError(errors, "Output state")` returned `null` with the error present.
 *
 * These slugs are never shown. `describeFieldErrorKey` turns one into a label at the render
 * boundary, so rewording copy can no longer break a lookup, and the helpers below take
 * `FieldErrorKey` rather than `string`, so a key that does not exist is a typecheck failure.
 *
 * The type does not catch a producer and a reader that each name a real but different key.
 * `getFirstFieldError(errors, FIELD_ERROR_KEYS.consolidation)` against an error filed under
 * `output-state` compiles, and the inline error under that field silently never appears, which
 * is the failure above. Rewording copy can no longer cause it. Pairing a producer with its
 * reader is still read by eye.
 */
export const FIELD_ERROR_KEYS = {
  advancedOptions: "advanced-options",
  assetsToLock: "assets-to-lock",
  certificateJson: "certificate-json",
  connectedPaymentKeyHash: "connected-payment-key-hash",
  consolidation: "consolidation",
  forwardedSttAssets: "forwarded-stt-assets",
  forwardedSttState: "forwarded-stt-state",
  fundPools: "fund-pools",
  limitedWithdrawal: "limited-withdrawal",
  newFundPools: "new-fund-pools",
  outputAssets: "output-assets",
  outputState: "output-state",
  payouts: "payouts",
  proofOfLifeRenewal: "proof-of-life-renewal",
  publish: "publish",
  scheduledPaymentPayout: "scheduled-payment-payout",
  specificProofOfLifeDate: "specific-proof-of-life-date",
  staking: "staking",
  stakingAddress: "staking-address",
  starterFunds: "starter-funds",
  sttInputIndex: "stt-input-index",
  sttInputTxHash: "stt-input-tx-hash",
  transfersForwardedOutputs: "transfers-forwarded-outputs",
  vote: "vote",
  voteJson: "vote-json",
  walletName: "wallet-name",
  walletRules: "wallet-rules",
  walletWithNoOwner: "wallet-with-no-owner",
  withdrawalAmount: "withdrawal-amount"
} as const;

/** One key per scheduled payment row, so each row's errors stay on that row. */
export type ScheduledPaymentFieldErrorKey = `scheduled-payment-${number}`;

export type FieldErrorKey =
  | (typeof FIELD_ERROR_KEYS)[keyof typeof FIELD_ERROR_KEYS]
  | ScheduledPaymentFieldErrorKey;

// `position` is the reader's numbering, so the first row is 1 rather than 0.
export function scheduledPaymentFieldErrorKey(position: number): ScheduledPaymentFieldErrorKey {
  return `scheduled-payment-${position}`;
}

const LABEL_BY_KEY = new Map<string, () => string>([
  [FIELD_ERROR_KEYS.advancedOptions, () => i18n("advancedOptions")],
  [FIELD_ERROR_KEYS.assetsToLock, () => i18n("assetsToLock")],
  [FIELD_ERROR_KEYS.certificateJson, () => i18n("certificateJson")],
  [FIELD_ERROR_KEYS.connectedPaymentKeyHash, () => i18n("connectedPaymentKeyHash")],
  [FIELD_ERROR_KEYS.consolidation, () => i18n("consolidation")],
  [FIELD_ERROR_KEYS.forwardedSttAssets, () => i18n("forwardedSttAssets")],
  [FIELD_ERROR_KEYS.forwardedSttState, () => i18n("forwardedSttState")],
  [FIELD_ERROR_KEYS.fundPools, () => i18n("fundPools")],
  [FIELD_ERROR_KEYS.limitedWithdrawal, () => i18n("limitedWithdrawal")],
  [FIELD_ERROR_KEYS.newFundPools, () => i18n("newFundPools")],
  [FIELD_ERROR_KEYS.outputAssets, () => i18n("outputAssets")],
  [FIELD_ERROR_KEYS.outputState, () => i18n("outputState")],
  [FIELD_ERROR_KEYS.payouts, () => i18n("payouts")],
  [FIELD_ERROR_KEYS.proofOfLifeRenewal, () => i18n("proofOfLifeRenewal")],
  [FIELD_ERROR_KEYS.publish, () => i18n("publish")],
  [FIELD_ERROR_KEYS.scheduledPaymentPayout, () => i18n("scheduledPaymentPayout")],
  [FIELD_ERROR_KEYS.specificProofOfLifeDate, () => i18n("specificProofOfLifeDate")],
  [FIELD_ERROR_KEYS.staking, () => i18n("staking")],
  [FIELD_ERROR_KEYS.stakingAddress, () => i18n("stakingAddress")],
  [FIELD_ERROR_KEYS.starterFunds, () => i18n("starterFunds")],
  [FIELD_ERROR_KEYS.sttInputIndex, () => i18n("sttInputIndex")],
  [FIELD_ERROR_KEYS.sttInputTxHash, () => i18n("sttInputTxHash")],
  [FIELD_ERROR_KEYS.transfersForwardedOutputs, () => i18n("transfersForwardedOutputs")],
  [FIELD_ERROR_KEYS.vote, () => i18n("vote")],
  [FIELD_ERROR_KEYS.voteJson, () => i18n("voteJson")],
  [FIELD_ERROR_KEYS.walletName, () => i18n("walletName")],
  [FIELD_ERROR_KEYS.walletRules, () => i18n("walletRules")],
  [FIELD_ERROR_KEYS.walletWithNoOwner, () => i18n("walletWithNoOwner")],
  [FIELD_ERROR_KEYS.withdrawalAmount, () => i18n("withdrawalAmount")]
]);

const SCHEDULED_PAYMENT_KEY_PATTERN = /^scheduled-payment-(\d+)$/;

/**
 * The one place a field-error identity becomes text a reader sees. An unknown key is returned
 * as it stands: zod can file an issue under its own path, and showing that is better than
 * showing nothing.
 */
export function describeFieldErrorKey(key: string): string {
  const label = LABEL_BY_KEY.get(key);
  if (label) {
    return label();
  }

  const scheduledPayment = SCHEDULED_PAYMENT_KEY_PATTERN.exec(key);
  if (scheduledPayment) {
    return i18n("scheduledPaymentPosition", { position: scheduledPayment[1] ?? "" });
  }

  return key;
}
