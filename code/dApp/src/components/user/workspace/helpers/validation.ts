import { type FieldErrors } from "@/components/user/flow-types";
import { describeStateValidationError } from "@/components/user/workspace/helpers/state-validation-copy";
import { type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { describeAddressProblem } from "@/lib/contracts/payout-address";
import { type Asset, type WalletInputRef } from "@/lib/types/contracts";
import { z } from "zod";

export const NON_NEGATIVE_INTEGER_SCHEMA = z
  .string()
  .trim()
  .regex(/^\d+$/, "Enter a whole number.");

export const OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || /^\d+$/.test(value), "Enter a whole number.");

export const REQUIRED_TEXT_SCHEMA = z.string().trim().min(1, "This field is required.");

export function pushFieldError(errors: FieldErrors, key: string, message: string) {
  if (!errors[key]) {
    errors[key] = [];
  }

  errors[key].push(message);
}

function applyZodErrors(errors: FieldErrors, result: z.ZodSafeParseError<unknown>) {
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    pushFieldError(errors, key, issue.message);
  }
}

export function validateField<Value>(
  errors: FieldErrors,
  key: string,
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

export function getFirstFieldError(errors: FieldErrors, key: string) {
  return errors[key]?.[0] ?? null;
}

export function validateAssetRows(errors: FieldErrors, key: string, assets: Asset[]) {
  assets.forEach((asset, index) => {
    const hasUnit = asset.unit.trim().length > 0;
    const hasQuantity = asset.quantity.trim().length > 0;

    if (!hasUnit && !hasQuantity) {
      return;
    }

    if (!hasUnit || !hasQuantity) {
      pushFieldError(errors, key, `Complete asset row ${index + 1} before building.`);
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
  key: string,
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
      pushFieldError(errors, key, `Fund pool ${index + 1} is missing a transaction hash.`);
    }

    if (!Number.isInteger(entry.outputIndex) || entry.outputIndex < 0) {
      pushFieldError(errors, key, `Fund pool ${index + 1} needs a valid output index.`);
    }
  });
}

// `minimumCount` mirrors `validateWalletInputRefs` above. The send paths pass 1: with no
// payout staged, every other check passes vacuously, so the review rail listed no blocking
// issue and `Send funds` sat armed over an empty transaction.
export function validateTransferRows(
  errors: FieldErrors,
  key: string,
  transfers: TransferFormState[],
  minimumCount = 0
) {
  if (transfers.length < minimumCount) {
    pushFieldError(
      errors,
      key,
      minimumCount === 1
        ? "Add a payout before you send. Pick a recipient, enter an amount, then Add payout."
        : `Add at least ${minimumCount} payouts before you send.`
    );
  }

  transfers.forEach((transfer, index) => {
    // Checked here, at input time, rather than only in `encodePayoutAddressToData` at
    // serialize time: ADA sent to a malformed or wrong-network address is unrecoverable, so
    // the user has to hear about it while the field is still in front of them.
    const addressProblem = describeAddressProblem(transfer.address);
    if (addressProblem) {
      pushFieldError(errors, key, `Recipient ${index + 1}: ${addressProblem}`);
    }

    validateAssetRows(errors, key, transfer.amount);
  });
}

export function validateWalletScriptOutputs(
  errors: FieldErrors,
  key: string,
  outputs: WalletScriptOutputFormState[]
) {
  outputs.forEach((output) => validateAssetRows(errors, key, output.amount));
}

// The one boundary where contract validation output becomes UI text. Every message crosses
// here, so the datum-path rewrite belongs here and nowhere else.
export function appendValidationErrors(errors: FieldErrors, key: string, validationErrors: string[]) {
  for (const validationError of validationErrors) {
    pushFieldError(errors, key, describeStateValidationError(validationError));
  }
}

export function countFieldErrorMessages(fieldErrors: FieldErrors) {
  return Object.values(fieldErrors).reduce((total, messages) => total + messages.length, 0);
}

