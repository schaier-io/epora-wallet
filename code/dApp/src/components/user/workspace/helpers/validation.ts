import { FIELD_ERROR_KEYS, type FieldErrorKey } from "@/components/user/field-error-keys";
import { type FieldErrors } from "@/components/user/flow-types";
import { describeStateValidationError } from "@/components/user/workspace/helpers/state-validation-copy";
import { type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { describeAddressProblem } from "@/lib/contracts/payout-address";
import { type Asset, type WalletInputRef } from "@/lib/types/contracts";
import { z } from "zod";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceHelpersValidation.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceHelpersValidation", defaultMessages);

export const NON_NEGATIVE_INTEGER_SCHEMA = z
  .string()
  .trim()
  .regex(/^\d+$/, i18n("enterAWholeNumber"));

export const OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || /^\d+$/.test(value), i18n("enterAWholeNumber"));

export const REQUIRED_TEXT_SCHEMA = z.string().trim().min(1, i18n("thisFieldIsRequired"));

// Every caller outside this file files under a `FieldErrorKey`, so a producer and the field
// editor that reads the error back cannot drift apart without a typecheck failure. Zod's own
// issue paths are the one exception. `validateField` folds the path-less bucket (`form`) onto
// the caller's key below; an issue carrying a real path would keep that path as its key and
// reach the reader as it stands. No schema here produces one, since all three are string
// scalars, so a schema with an object or array shape is what would make that reachable.
function writeFieldError(errors: FieldErrors, key: string, message: string) {
  if (!errors[key]) {
    errors[key] = [];
  }

  errors[key].push(message);
}

export function pushFieldError(errors: FieldErrors, key: FieldErrorKey, message: string) {
  writeFieldError(errors, key, message);
}

function applyZodErrors(errors: FieldErrors, result: z.ZodSafeParseError<unknown>) {
  for (const issue of result.error.issues) {
    writeFieldError(errors, issue.path.join(".") || "form", issue.message);
  }
}

export function validateField<Value>(
  errors: FieldErrors,
  key: FieldErrorKey,
  schema: z.ZodType<Value>,
  value: unknown
) {
  const result = schema.safeParse(value);

  if (!result.success) {
    const existingFormErrors = [...(errors.form ?? [])];
    applyZodErrors(errors, result);

    if (errors.form) {
      errors[key] = [...(errors[key] ?? []), ...errors.form];
      delete errors.form;
    }

    if (existingFormErrors.length > 0) {
      errors[key] = [...existingFormErrors, ...(errors[key] ?? [])];
    }
  }
}

export function hasFieldErrors(errors: FieldErrors) {
  return Object.keys(errors).length > 0;
}

export function getFirstFieldError(errors: FieldErrors, key: FieldErrorKey) {
  return errors[key]?.[0] ?? null;
}

export function validateAssetRows(errors: FieldErrors, key: FieldErrorKey, assets: Asset[]) {
  assets.forEach((asset, index) => {
    const hasUnit = asset.unit.trim().length > 0;
    const hasQuantity = asset.quantity.trim().length > 0;

    if (!hasUnit && !hasQuantity) {
      return;
    }

    if (!hasUnit || !hasQuantity) {
      pushFieldError(errors, key, i18n("completeAssetRowValue1BeforeYouContinue", { value1: index + 1 }));
      return;
    }

    validateField(
      errors,
      key,
      NON_NEGATIVE_INTEGER_SCHEMA,
      asset.quantity
    );
  });
}

export function hasPositiveAssetAmount(assets: Asset[]) {
  return assets.some((asset) => {
    const quantity = asset.quantity.trim();

    return asset.unit.trim().length > 0 && /^\d+$/.test(quantity) && BigInt(quantity) > 0n;
  });
}

export function validateWalletInputRefs(
  errors: FieldErrors,
  key: FieldErrorKey,
  refs: WalletInputRef[],
  minimumCount = 0
) {
  if (refs.length < minimumCount) {
    pushFieldError(
      errors,
      key,
      minimumCount === 1
        ? "Select at least one fund pool."
        : `Select at least ${minimumCount} fund pools.`
    );
  }

  refs.forEach((entry, index) => {
    if (!entry.txHash.trim()) {
      pushFieldError(errors, key, i18n("fundPoolValue1IsMissingATransactionHash", { value1: index + 1 }));
    }

    if (!Number.isInteger(entry.outputIndex) || entry.outputIndex < 0) {
      pushFieldError(errors, key, i18n("fundPoolValue1NeedsAValidOutputIndex", { value1: index + 1 }));
    }
  });
}

// An empty list is a fact about the whole action, not about the section the caller's `key`
// names: filed under "Transfers / forwarded outputs", the rail paired the advanced section's
// name with first-payout guidance that belongs one panel above it -- and the same message
// also filled the section's inline hint, so the reader met it three times on one screen.
// `FIELD_ERROR_KEYS.payouts` is one no field editor looks up, so the how-to stays in the
// draft's next-step line and the row-level checks (address, amounts) stay on the caller's key.
//
// `minimumCount` mirrors `validateWalletInputRefs` above. The send paths pass 1: with no
// payout staged, every other check passes vacuously, so the review rail listed no blocking
// issue and `Send funds` sat armed over an empty transaction.
export function validateTransferRows(
  errors: FieldErrors,
  key: FieldErrorKey,
  transfers: TransferFormState[],
  minimumCount = 0
) {
  if (transfers.length < minimumCount) {
    pushFieldError(
      errors,
      FIELD_ERROR_KEYS.payouts,
      minimumCount === 1
        ? "No payout is staged yet."
        : `At least ${minimumCount} payouts are required before you can send.`
    );
  }

  transfers.forEach((transfer, index) => {
    // Checked here, at input time, rather than only in `encodePayoutAddressToData` at
    // serialize time: ADA sent to a malformed or wrong-network address is unrecoverable, so
    // the user has to hear about it while the field is still in front of them.
    const addressProblem = describeAddressProblem(transfer.address);
    if (addressProblem) {
      pushFieldError(errors, key, i18n("recipientValue1Addressproblem", { value1: index + 1, addressProblem: addressProblem }));
    }

    validateAssetRows(errors, key, transfer.amount);
  });
}

export function validateWalletScriptOutputs(
  errors: FieldErrors,
  key: FieldErrorKey,
  outputs: WalletScriptOutputFormState[]
) {
  outputs.forEach((output) => validateAssetRows(errors, key, output.amount));
}

// The one boundary where contract validation output becomes UI text. Every message crosses
// here, so the datum-path rewrite belongs here and nowhere else.
export function appendValidationErrors(errors: FieldErrors, key: FieldErrorKey, validationErrors: string[]) {
  for (const validationError of validationErrors) {
    pushFieldError(errors, key, describeStateValidationError(validationError));
  }
}

export function countFieldErrorMessages(fieldErrors: FieldErrors) {
  return Object.values(fieldErrors).reduce((total, messages) => total + messages.length, 0);
}

