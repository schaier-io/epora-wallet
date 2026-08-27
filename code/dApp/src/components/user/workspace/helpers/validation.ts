import { type FieldErrors } from "@/components/user/flow-types";
import { type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
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
      pushFieldError(errors, key, i18n("completeAssetRowValue1BeforeBuilding", { value1: index + 1 }));
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
        ? i18n("selectAtLeastOneWalletInput")
        : i18n("selectAtLeastMinimumcountWalletInputs", { minimumCount })
    );
  }

  refs.forEach((entry, index) => {
    if (!entry.txHash.trim()) {
      pushFieldError(errors, key, i18n("walletInputValue1IsMissingATxHash", { value1: index + 1 }));
    }

    if (!Number.isInteger(entry.outputIndex) || entry.outputIndex < 0) {
      pushFieldError(errors, key, i18n("walletInputValue1NeedsAValidOutputIndex", { value1: index + 1 }));
    }
  });
}

export function validateTransferRows(errors: FieldErrors, key: string, transfers: TransferFormState[]) {
  transfers.forEach((transfer, index) => {
    if (!transfer.address.trim()) {
      pushFieldError(errors, key, i18n("transferValue1IsMissingADestinationAddress", { value1: index + 1 }));
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

export function appendValidationErrors(errors: FieldErrors, key: string, validationErrors: string[]) {
  if (validationErrors.length > 0) {
    pushFieldError(errors, key, i18n("sectionContainsInvalidWalletRules"));
  }
}

export function countFieldErrorMessages(fieldErrors: FieldErrors) {
  return Object.values(fieldErrors).reduce((total, messages) => total + messages.length, 0);
}
