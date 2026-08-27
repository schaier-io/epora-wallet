import type { ConstrData } from "@/lib/types/contracts";
import { assertValidAssetIdParts, serializeValueEntries } from "@/lib/contracts/value-data";
import { encodePayoutAddressToData } from "@/lib/contracts/payout-address";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsStateFormEncode.json";
import type {
  BeneficiaryFormState,
  StateAssetAmountForm,
  StreamingPaymentFormState,
  UserFormState
} from "@/lib/contracts/state-form";

const i18n = createDefaultTranslator("LibContractsStateFormEncode", defaultMessages);

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
    throw new Error(i18n("mustBeWholeNumber", { label }));
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(i18n("outsideSupportedRange", { label }));
  }

  return parsed;
}

export function parseNonNegativeIntegerString(value: string, label: string): number {
  const parsed = parseIntegerString(value, label);
  if (parsed < 0) {
    throw new Error(i18n("mustBeZeroOrMore", { label }));
  }

  return parsed;
}

function parsePositiveIntegerString(value: string, label: string): number {
  const parsed = parseIntegerString(value, label);
  if (parsed < 1) {
    throw new Error(i18n("mustBeAtLeastOne", { label }));
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
      amount: BigInt(
        parseNonNegativeIntegerString(
          form.amount,
          i18n("assetNumberAmount", { label, number: index + 1 })
        )
      )
    })),
    label
  );
}

export function serializeUser(form: UserFormState, index: number): ConstrData {
  const effectiveCanRenewProofOfLife = form.isAdmin ? true : form.canRenewProofOfLife;

  return {
    alternative: 0,
    fields: [
      parseNonNegativeIntegerString(form.id, i18n("personNumberId", { number: index + 1 })),
      form.wallets
        .map((wallet) => wallet.trim())
        .filter((wallet) => wallet.length > 0),
      serializeStateAssetAmountList(
        form.perDayAllowance,
        i18n("personNumberDailyAllowance", { number: index + 1 })
      ),
      serializeStateAssetAmountList(
        form.remainingAllowance,
        i18n("personNumberRemainingAllowance", { number: index + 1 })
      ),
      parseNonNegativeIntegerString(
        form.nextAllowanceReset,
        i18n("personNumberNextAllowanceReset", { number: index + 1 })
      ),
      serializeBoolean(effectiveCanRenewProofOfLife),
      serializeOptionInteger(
        form.multiSigPowerMode,
        form.multiSigPower,
        i18n("personNumberApprovalWeight", { number: index + 1 })
      ),
      serializeBoolean(form.isAdmin)
    ]
  };
}

export function serializeBeneficiary(form: BeneficiaryFormState, index: number): ConstrData {
  return {
    alternative: 0,
    fields: [
      parseNonNegativeIntegerString(
        form.id,
        i18n("recoveryContactNumberId", { number: index + 1 })
      ),
      form.wallets.map((wallet) => wallet.trim()).filter((wallet) => wallet.length > 0),
      serializeOptionInteger(
        form.unlockAfterMode,
        form.unlockAfter,
        i18n("recoveryContactNumberDelay", { number: index + 1 })
      ),
      parsePositiveIntegerString(
        form.weight,
        i18n("recoveryContactNumberShareWeight", { number: index + 1 })
      )
    ]
  };
}

export function serializeStreamingPayment(form: StreamingPaymentFormState, index: number): ConstrData {
  const policyId = form.policyId.trim();
  const assetName = form.assetName.trim();

  assertValidAssetIdParts(
    policyId,
    assetName,
    i18n("scheduledPaymentNumber", { number: index + 1 })
  );

  return {
    alternative: 0,
    fields: [
      parseNonNegativeIntegerString(
        form.id,
        i18n("scheduledPaymentNumberId", { number: index + 1 })
      ),
      encodePayoutAddressToData(
        form.payoutAddress,
        i18n("scheduledPaymentNumberAddress", { number: index + 1 })
      ),
      parseNonNegativeIntegerString(
        form.paidOutAmount,
        i18n("scheduledPaymentNumberPaidAmount", { number: index + 1 })
      ),
      policyId,
      assetName,
      parseNonNegativeIntegerString(
        form.amountPerDay,
        i18n("scheduledPaymentNumberDailyAmount", { number: index + 1 })
      ),
      parseNonNegativeIntegerString(
        form.startDate,
        i18n("scheduledPaymentNumberStartDate", { number: index + 1 })
      ),
      parseNonNegativeIntegerString(
        form.endDate,
        i18n("scheduledPaymentNumberEndDate", { number: index + 1 })
      )
    ]
  };
}
