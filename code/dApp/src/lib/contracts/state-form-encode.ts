import type { ConstrData } from "@/lib/types/contracts";
import { serializeValueEntries } from "@/lib/contracts/value-data";
import { encodePayoutAddressToData } from "@/lib/contracts/payout-address";
import type {
  BeneficiaryFormState,
  StateAssetAmountForm,
  StreamingPaymentFormState,
  UserFormState
} from "@/lib/contracts/state-form";

// Leaf serializers for the form → datum direction, factored out of
// `state-form.ts` so that module stays focused on the public form API and the
// datum → form decoders. These have no back-dependency on `state-form.ts`
// beyond the (type-only) form shapes, so there is no runtime import cycle.

type OptionMode = "none" | "some";

const FALSE_CONSTR: ConstrData = { alternative: 0, fields: [] };
const TRUE_CONSTR: ConstrData = { alternative: 1, fields: [] };
const NONE_CONSTR: ConstrData = { alternative: 1, fields: [] };

export function parseIntegerString(value: string, label: string): number {
  const normalized = value.trim();

  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`${label} must be an integer.`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} is outside the supported integer range.`);
  }

  return parsed;
}

export function parseNonNegativeIntegerString(value: string, label: string): number {
  const parsed = parseIntegerString(value, label);
  if (parsed < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }

  return parsed;
}

function parsePositiveIntegerString(value: string, label: string): number {
  const parsed = parseIntegerString(value, label);
  if (parsed < 1) {
    throw new Error(`${label} must be at least 1.`);
  }

  return parsed;
}

function serializeBoolean(value: boolean): ConstrData {
  return value ? TRUE_CONSTR : FALSE_CONSTR;
}

export function serializeOptionInteger(mode: OptionMode, value: string, label: string): ConstrData {
  if (mode === "none") {
    return NONE_CONSTR;
  }

  return {
    alternative: 0,
    fields: [parseIntegerString(value, label)]
  };
}

function serializeStateAssetAmountList(
  forms: StateAssetAmountForm[],
  label: string
) {
  return serializeValueEntries(
    forms.map((form, index) => ({
      policyId: form.policyId.trim(),
      assetName: form.assetName.trim(),
      amount: BigInt(parseNonNegativeIntegerString(form.amount, `${label} entry ${index} amount`))
    })),
    label
  );
}

export function serializeUser(form: UserFormState, index: number): ConstrData {
  const effectiveCanRenewProofOfLife = form.isAdmin ? true : form.canRenewProofOfLife;

  return {
    alternative: 0,
    fields: [
      parseNonNegativeIntegerString(form.id, `User ${index + 1} id`),
      form.wallets
        .map((wallet) => wallet.trim())
        .filter((wallet) => wallet.length > 0),
      serializeStateAssetAmountList(
        form.perDayAllowance,
        `User ${index + 1} per-day allowance`
      ),
      serializeStateAssetAmountList(
        form.remainingAllowance,
        `User ${index + 1} remaining allowance`
      ),
      parseNonNegativeIntegerString(
        form.nextAllowanceReset,
        `User ${index + 1} next allowance reset`
      ),
      serializeBoolean(effectiveCanRenewProofOfLife),
      serializeOptionInteger(
        form.multiSigPowerMode,
        form.multiSigPower,
        `User ${index + 1} multisig power`
      ),
      serializeBoolean(form.isAdmin)
    ]
  };
}

export function serializeBeneficiary(form: BeneficiaryFormState, index: number): ConstrData {
  return {
    alternative: 0,
    fields: [
      parseNonNegativeIntegerString(form.id, `Beneficiary ${index + 1} id`),
      form.wallets.map((wallet) => wallet.trim()).filter((wallet) => wallet.length > 0),
      serializeOptionInteger(
        form.unlockAfterMode,
        form.unlockAfter,
        `Beneficiary ${index + 1} unlock after`
      ),
      parsePositiveIntegerString(form.weight, `Beneficiary ${index + 1} weight`)
    ]
  };
}

export function serializeStreamingPayment(form: StreamingPaymentFormState, index: number): ConstrData {
  const policyId = form.policyId.trim();
  const assetName = form.assetName.trim();

  if ((policyId.length === 0) !== (assetName.length === 0)) {
    throw new Error(
      `Streaming payment ${index + 1} policy id and asset name must both be empty for lovelace, or both be set for a native asset.`
    );
  }

  return {
    alternative: 0,
    fields: [
      parseNonNegativeIntegerString(form.id, `Streaming payment ${index + 1} id`),
      encodePayoutAddressToData(
        form.payoutAddress,
        `Streaming payment ${index + 1} payout address`
      ),
      parseNonNegativeIntegerString(
        form.paidOutAmount,
        `Streaming payment ${index + 1} paid out amount`
      ),
      policyId,
      assetName,
      parseNonNegativeIntegerString(
        form.amountPerDay,
        `Streaming payment ${index + 1} amount per day`
      ),
      parseNonNegativeIntegerString(
        form.startDate,
        `Streaming payment ${index + 1} start date`
      ),
      parseNonNegativeIntegerString(form.endDate, `Streaming payment ${index + 1} end date`)
    ]
  };
}
