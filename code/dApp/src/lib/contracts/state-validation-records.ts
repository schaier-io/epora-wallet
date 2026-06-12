import type { Data } from "@meshsdk/common";
import { isConstrData } from "@/lib/contracts/state-layout";
import { parseValueData } from "@/lib/contracts/value-data";
import { isAddressData } from "@/lib/contracts/payout-address";

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
    errors.push(`${path} must be an integer.`);
    return false;
  }

  if (typeof options.min === "number" && value < options.min) {
    errors.push(`${path} must be >= ${options.min}.`);
    return false;
  }

  if (typeof options.max === "number" && value > options.max) {
    errors.push(`${path} must be <= ${options.max}.`);
    return false;
  }

  return true;
}

export function validateByteArray(value: Data, path: string, errors: string[]): value is string {
  if (typeof value !== "string") {
    errors.push(`${path} must be a byte-array string.`);
    return false;
  }

  return true;
}

function validateWalletList(value: Data, path: string, errors: string[]): boolean {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be a list.`);
    return false;
  }

  for (const [index, wallet] of value.entries()) {
    validateByteArray(wallet, `${path}[${index}]`, errors);
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
    errors.push(`${path} must be an Option constructor.`);
    return null;
  }

  if (value.alternative === 1 && value.fields.length === 0) {
    return { kind: "none" };
  }

  if (value.alternative === 0 && value.fields.length === 1) {
    return { kind: "some", value: value.fields[0] };
  }

  errors.push(`${path} must be a valid Option constructor.`);
  return null;
}

function readBoolean(value: Data, path: string, errors: string[]): boolean | null {
  if (!isConstrData(value) || value.fields.length !== 0) {
    errors.push(`${path} must be a Bool constructor.`);
    return null;
  }

  if (value.alternative === 0) {
    return false;
  }

  if (value.alternative === 1) {
    return true;
  }

  errors.push(`${path} must be a valid Bool constructor.`);
  return null;
}

function validateValueData(value: Data, path: string, errors: string[]): boolean {
  try {
    const entries = parseValueData(value, path);

    for (const [index, entry] of entries.entries()) {
      validateByteArray(entry.policyId, `${path}[${index}].policy_id`, errors);
      validateByteArray(entry.assetName, `${path}[${index}].asset_name`, errors);

      if (entry.amount < 0n) {
        errors.push(`${path}[${index}].amount must be >= 0.`);
      }
    }

    return true;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : `${path} must be a Value map.`);
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
    errors.push(`${path} must be a User constructor.`);
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
  ] = value.fields;

  const userId = readValidatedInteger(id, `${path}.id`, errors, { min: 0 });
  validateWalletList(userWallets, `${path}.user_wallets`, errors);
  validateValueData(perDayAllowance, `${path}.per_day_allowance`, errors);
  validateValueData(remainingAllowance, `${path}.remaining_allowance`, errors);
  // Inner-collection caps (audit A1): bound the per-record lists so the datum
  // cannot be grown past the on-chain execution budget.
  if (readWalletEntries(userWallets).length > MAX_WALLETS_PER_USER) {
    errors.push(`${path}.user_wallets can list at most ${MAX_WALLETS_PER_USER} keys.`);
  }
  if (countValueEntries(perDayAllowance) > MAX_ALLOWANCE_ENTRIES) {
    errors.push(`${path}.per_day_allowance can list at most ${MAX_ALLOWANCE_ENTRIES} assets.`);
  }
  if (countValueEntries(remainingAllowance) > MAX_ALLOWANCE_ENTRIES) {
    errors.push(`${path}.remaining_allowance can list at most ${MAX_ALLOWANCE_ENTRIES} assets.`);
  }
  validateInteger(nextAllowanceReset, `${path}.next_allowance_reset`, errors);
  readBoolean(canRenewProofOfLife, `${path}.can_renew_proof_of_life`, errors);

  const power = readOption(multiSigPower, `${path}.multi_sig_power`, errors);
  if (power?.kind === "some") {
    validateInteger(power.value, `${path}.multi_sig_power.Some`, errors, { min: 0 });
  }

  readBoolean(isAdmin, `${path}.is_admin`, errors);
  return userId;
}

export function validateBeneficiary(value: Data, path: string, errors: string[]): number | null {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 4) {
    errors.push(`${path} must be a Beneficiary constructor.`);
    return null;
  }

  const [id, beneficiaryWallets, unlockAfter, weight] = value.fields;

  const beneficiaryId = readValidatedInteger(id, `${path}.id`, errors, { min: 0 });
  validateWalletList(beneficiaryWallets, `${path}.beneficiary_wallets`, errors);
  // Mirrors the on-chain rule in `lib/state/configuration.ak::expect_beneficiaries_are_valid`:
  // every beneficiary must carry at least one signable wallet. Under the
  // weighted-share model a wallet-less beneficiary can never withdraw yet still
  // dilutes (and would permanently lock) the signable beneficiaries' shares, so
  // such a config is rejected rather than silently passing the reachability gate.
  if (readWalletEntries(beneficiaryWallets).length === 0) {
    errors.push(
      `${path}.beneficiary_wallets must list at least one wallet — a recovery contact with no key can never recover, and their share of the pool would be permanently locked.`
    );
  }
  // Inner-collection cap (audit A1): bound the wallet list so it cannot bloat the datum.
  if (readWalletEntries(beneficiaryWallets).length > MAX_BENEFICIARY_WALLETS) {
    errors.push(
      `${path}.beneficiary_wallets can list at most ${MAX_BENEFICIARY_WALLETS} keys.`
    );
  }

  const unlockAfterValue = readOption(unlockAfter, `${path}.unlock_after`, errors);
  if (unlockAfterValue?.kind === "some") {
    validateInteger(unlockAfterValue.value, `${path}.unlock_after.Some`, errors, { min: 0 });
  }

  // Proportional share weight; must be a positive integer (on-chain `weight >= 1`).
  validateInteger(weight, `${path}.weight`, errors, { min: 1 });

  return beneficiaryId;
}

export function validateStreamingPayment(value: Data, path: string, errors: string[]): number | null {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 8) {
    errors.push(`${path} must be a StreamingPayment constructor.`);
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
  ] = value.fields;

  if (!validateInteger(id, `${path} id`, errors, { min: 0 })) {
    return null;
  }

  if (!isAddressData(payoutAddress)) {
    errors.push(`${path} payout address must be a valid Cardano address.`);
  }

  validateInteger(paidOutAmount, `${path} already-paid amount`, errors, { min: 0 });
  validateByteArray(policyId, `${path} policy id`, errors);
  validateByteArray(assetName, `${path} asset name`, errors);
  if (
    typeof policyId === "string" &&
    typeof assetName === "string" &&
    ((policyId.length === 0 && assetName.length > 0) ||
      (policyId.length > 0 && assetName.length === 0))
  ) {
    errors.push(
      `${path}: set both the policy id and asset name for a native asset, or leave both empty for ADA.`
    );
  }
  validateInteger(amountPerDay, `${path} amount per day`, errors, { min: 0 });

  const hasValidStart = validateInteger(startDate, `${path} start date`, errors, { min: 0 });
  const hasValidEnd = validateInteger(endDate, `${path} end date`, errors, { min: 0 });
  if (hasValidStart && hasValidEnd && startDate >= endDate) {
    errors.push(`${path}: the start date must be before the end date.`);
  }

  return id;
}
