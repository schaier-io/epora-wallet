import type { Data } from "@meshsdk/common";
import { isConstrData } from "@/lib/contracts/state-layout";
import {
  MAX_ASSET_NAME_BYTES,
  assertValidAssetIdParts,
  parseValueData
} from "@/lib/contracts/value-data";
import { isAddressData, isCredentialHash } from "@/lib/contracts/payout-address";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsStateValidationRecords.json";

const i18n = createDefaultTranslator("LibContractsStateValidationRecords", defaultMessages);

// Mirror of the on-chain caps in `lib/constants.ak` (max_users /
// max_beneficiaries / max_streaming_payments). The contract rejects any mint or
// UpdateState whose lists exceed them, to bound the per-transaction execution
// cost so a wallet cannot be grown past the budget and stranded. These checks
// are advisory (fast UI feedback); the on-chain checks are the guarantee.
// Drift from the contract is caught by `constants-parity.test.ts` (which parses
// constants.ak), so these values cannot silently diverge.
export const MAX_USERS = 15;
export const MAX_BENEFICIARIES = 25;
export const MAX_STREAMING_PAYMENTS = 25;

// Mirror of the on-chain INNER-collection caps (audit A1; `lib/constants.ak`
// max_wallets_per_user / max_allowance_entries / max_beneficiary_wallets). The
// record-count caps above bound the outer lists; these bound the lists each
// record carries, so a wallet datum cannot be grown past the on-chain execution
// budget and stranded. Advisory here; the contract is the guarantee. Parity with
// constants.ak is enforced by `constants-parity.test.ts`.
export const MAX_WALLETS_PER_USER = 10;
export const MAX_ALLOWANCE_ENTRIES = 10;
export const MAX_BENEFICIARY_WALLETS = 10;
export { MAX_ASSET_NAME_BYTES };

type IntegerValidationOptions = {
  min?: number;
  max?: number;
};

export function validateInteger(
  value: Data,
  path: string,
  errors: string[],
  options: IntegerValidationOptions = {}
): value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    errors.push(i18n("mustBeInteger", { path }));
    return false;
  }

  if (typeof options.min === "number" && value < options.min) {
    errors.push(i18n("mustBeAtLeast", { path, min: options.min }));
    return false;
  }

  if (typeof options.max === "number" && value > options.max) {
    errors.push(i18n("mustBeAtMost", { path, max: options.max }));
    return false;
  }

  return true;
}

export function validateByteArray(value: Data, path: string, errors: string[]): value is string {
  if (typeof value !== "string") {
    errors.push(i18n("mustBeByteArray", { path }));
    return false;
  }

  return true;
}

export function validateCredentialHash(
  value: Data,
  path: string,
  errors: string[]
): value is string {
  if (!isCredentialHash(value)) {
    errors.push(i18n("mustBeCredentialHash", { path }));
    return false;
  }

  return true;
}

function validateWalletList(value: Data, path: string, errors: string[]): boolean {
  if (!Array.isArray(value)) {
    errors.push(i18n("mustBeList", { path }));
    return false;
  }

  for (const [index, wallet] of value.entries()) {
    validateCredentialHash(wallet, `${path} ${index + 1}`, errors);
  }

  return true;
}

export function readWalletEntries(value: Data): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

// Count the (policy_id, asset_name) entries in a Value datum, for the advisory
// allowance-entry cap (audit A1). Returns 0 if the value cannot be parsed — the
// shape is validated separately by validateValueData.
function countValueEntries(value: Data): number {
  try {
    return parseValueData(value, "allowance").length;
  } catch {
    return 0;
  }
}

export function readOption(
  value: Data,
  path: string,
  errors: string[]
): { kind: "none" } | { kind: "some"; value: Data } | null {
  if (!isConstrData(value)) {
    errors.push(i18n("mustBeOption", { path }));
    return null;
  }

  if (value.alternative === 1 && value.fields.length === 0) {
    return { kind: "none" };
  }

  if (value.alternative === 0 && value.fields.length === 1) {
    return { kind: "some", value: value.fields[0]! };
  }

  errors.push(i18n("mustBeValidOption", { path }));
  return null;
}

function readBoolean(value: Data, path: string, errors: string[]): boolean | null {
  if (!isConstrData(value) || value.fields.length !== 0) {
    errors.push(i18n("mustBeBoolean", { path }));
    return null;
  }

  if (value.alternative === 0) {
    return false;
  }

  if (value.alternative === 1) {
    return true;
  }

  errors.push(i18n("mustBeValidBoolean", { path }));
  return null;
}

function validateValueData(value: Data, path: string, errors: string[]): boolean {
  try {
    const entries = parseValueData(value, path);

    for (const [index, entry] of entries.entries()) {
      assertValidAssetIdParts(entry.policyId, entry.assetName, `${path}[${index}]`);

      if (entry.amount < 0n) {
        errors.push(i18n("assetAmountMustBeNonNegative", { path, number: index + 1 }));
      }
    }

    return true;
  } catch {
    errors.push(i18n("mustBeAssetValue", { path }));
    return false;
  }
}

function readValidatedInteger(
  value: Data,
  path: string,
  errors: string[],
  options: IntegerValidationOptions = {}
): number | null {
  return validateInteger(value, path, errors, options) ? value : null;
}

export function validateUser(value: Data, path: string, errors: string[]): number | null {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 8) {
    errors.push(i18n("mustBePersonRecord", { path }));
    return null;
  }

  const [
    id,
    userWallets,
    perDayAllowance,
    remainingAllowance,
    nextAllowanceReset,
    canRenewProofOfLife,
    multiSigPower,
    isAdmin
    // Length checked above (=== 8), so the tuple shape is guaranteed.
  ] = value.fields as [Data, Data, Data, Data, Data, Data, Data, Data];

  const userId = readValidatedInteger(id, `${path} ID`, errors, { min: 0 });
  validateWalletList(userWallets, `${path} signer key`, errors);
  validateValueData(perDayAllowance, `${path} daily allowance`, errors);
  validateValueData(remainingAllowance, `${path} remaining allowance`, errors);
  // Inner-collection caps (audit A1): bound the per-record lists so the datum
  // cannot be grown past the on-chain execution budget.
  if (readWalletEntries(userWallets).length > MAX_WALLETS_PER_USER) {
    errors.push(i18n("tooManySignerKeys", { path, limit: MAX_WALLETS_PER_USER }));
  }
  if (countValueEntries(perDayAllowance) > MAX_ALLOWANCE_ENTRIES) {
    errors.push(i18n("tooManyAllowanceAssets", { path, limit: MAX_ALLOWANCE_ENTRIES }));
  }
  if (countValueEntries(remainingAllowance) > MAX_ALLOWANCE_ENTRIES) {
    errors.push(i18n("tooManyRemainingAllowanceAssets", { path, limit: MAX_ALLOWANCE_ENTRIES }));
  }
  validateInteger(nextAllowanceReset, `${path} next allowance reset`, errors);
  readBoolean(canRenewProofOfLife, `${path} wake-up timer permission`, errors);

  const power = readOption(multiSigPower, `${path} approval weight`, errors);
  if (power?.kind === "some") {
    validateInteger(power.value, `${path} approval weight`, errors, { min: 0 });
  }

  readBoolean(isAdmin, `${path} owner role`, errors);
  return userId;
}

export function validateBeneficiary(value: Data, path: string, errors: string[]): number | null {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 4) {
    errors.push(i18n("mustBeRecoveryContactRecord", { path }));
    return null;
  }

  // Length checked above (=== 4), so the tuple shape is guaranteed.
  const [id, beneficiaryWallets, unlockAfter, weight] = value.fields as [Data, Data, Data, Data];

  const beneficiaryId = readValidatedInteger(id, `${path} ID`, errors, { min: 0 });
  validateWalletList(beneficiaryWallets, `${path} signer key`, errors);
  // Mirrors the on-chain rule in `lib/state/configuration.ak::expect_beneficiaries_are_valid`:
  // every beneficiary must carry at least one signable wallet. Under the
  // weighted-share model a wallet-less beneficiary can never withdraw yet still
  // dilutes (and would permanently lock) the signable beneficiaries' shares, so
  // such a config is rejected rather than silently passing the reachability gate.
  if (readWalletEntries(beneficiaryWallets).length === 0) {
    errors.push(
      i18n("recoveryContactNeedsSigner", { path })
    );
  }
  // Inner-collection cap (audit A1): bound the wallet list so it cannot bloat the datum.
  if (readWalletEntries(beneficiaryWallets).length > MAX_BENEFICIARY_WALLETS) {
    errors.push(
      i18n("tooManyRecoverySignerKeys", { path, limit: MAX_BENEFICIARY_WALLETS })
    );
  }

  const unlockAfterValue = readOption(unlockAfter, `${path} personal delay`, errors);
  if (unlockAfterValue?.kind === "some") {
    validateInteger(unlockAfterValue.value, `${path} personal delay`, errors, { min: 0 });
  }

  // Proportional share weight; must be a positive integer (on-chain `weight >= 1`).
  validateInteger(weight, `${path} share weight`, errors, { min: 1 });

  return beneficiaryId;
}

export function validateStreamingPayment(value: Data, path: string, errors: string[]): number | null {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 8) {
    errors.push(i18n("mustBeScheduledPaymentRecord", { path }));
    return null;
  }

  const [
    id,
    payoutAddress,
    paidOutAmount,
    policyId,
    assetName,
    amountPerDay,
    startDate,
    endDate
    // Length checked above (=== 8), so the tuple shape is guaranteed.
  ] = value.fields as [Data, Data, Data, Data, Data, Data, Data, Data];

  if (!validateInteger(id, `${path} id`, errors, { min: 0 })) {
    return null;
  }

  if (!isAddressData(payoutAddress)) {
    errors.push(i18n("invalidPayoutAddress", { path }));
  }

  validateInteger(paidOutAmount, `${path} already-paid amount`, errors, { min: 0 });
  if (typeof policyId === "string" && typeof assetName === "string") {
    try {
      assertValidAssetIdParts(policyId, assetName, path);
    } catch {
      errors.push(i18n("invalidAssetId", { path }));
    }
  } else {
    validateByteArray(policyId, `${path} policy id`, errors);
    validateByteArray(assetName, `${path} asset name`, errors);
  }
  validateInteger(amountPerDay, `${path} amount per day`, errors, { min: 0 });

  const hasValidStart = validateInteger(startDate, `${path} start date`, errors, { min: 0 });
  const hasValidEnd = validateInteger(endDate, `${path} end date`, errors, { min: 0 });
  if (hasValidStart && hasValidEnd && startDate > endDate) {
    errors.push(i18n("startAfterEnd", { path }));
  }

  return id;
}
