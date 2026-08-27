// Composite validators shared by action-validation.ts and
// action-validation-spend.ts. Each encodes one field pattern that used to be
// copy-pasted per action — fix a message or rule here and every action gets it.
import { type FieldErrors } from "@/components/user/flow-types";
import {
  OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
  REQUIRED_TEXT_SCHEMA,
  appendValidationErrors,
  pushFieldError,
  validateAssetRows,
  validateField,
  validateTransferRows,
  validateWalletInputRefs,
  validateWalletScriptOutputs
} from "@/components/user/workspace/helpers";
import {
  type ProofOfLifeOverrideMode,
  type StateFormState,
  countAdminUsersInStateForm,
  stateFormToDatum
} from "@/lib/contracts/state-form";
import { validateStateDatum } from "@/lib/contracts/state-validation";
import { extractErrorMessage } from "@/lib/utils/errors";
import { type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { type Asset, type WalletInputRef } from "@/lib/types/contracts";
import { FIELD_ERROR_IDS } from "@/components/user/workspace/field-error-ids";

type StateActionAlternative = Parameters<typeof stateFormToDatum>[1];

/** The `STT input tx hash` + `STT input index` field pair every STT action carries. */
export function validateSttInputRef(
  errors: FieldErrors,
  txHash: string,
  indexStr: string
): void {
  validateField(errors, FIELD_ERROR_IDS.walletIdentityTransactionHash, REQUIRED_TEXT_SCHEMA, txHash);
  validateField(errors, FIELD_ERROR_IDS.walletIdentityOutputIndex, OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA, indexStr);
}

/**
 * Actions that would leave the wallet without a direct owner require explicit
 * confirmation. The caller supplies a complete localized sentence.
 */
export function requireZeroAdminConfirmation(
  errors: FieldErrors,
  stateForm: StateFormState,
  confirmed: boolean,
  message: string
): void {
  if (countAdminUsersInStateForm(stateForm) === 0 && !confirmed) {
    pushFieldError(
      errors,
      FIELD_ERROR_IDS.noDirectOwner,
      message
    );
  }
}

/** The "specific" wake-up timer override needs a whole-number local timestamp. */
export function validateSpecificWakeUpDate(
  errors: FieldErrors,
  overrideMode: ProofOfLifeOverrideMode,
  dateTime: string,
  invalidMessage: string
): void {
  if (overrideMode !== "specific") {
    return;
  }
  validateField(errors, FIELD_ERROR_IDS.specificWakeUpTimerDate, REQUIRED_TEXT_SCHEMA, dateTime);
  const trimmed = dateTime.trim();
  if (trimmed && !/^\d+$/.test(trimmed)) {
    pushFieldError(
      errors,
      FIELD_ERROR_IDS.specificWakeUpTimerDate,
      invalidMessage
    );
  }
}

/**
 * Builds the output-state datum and runs the on-chain state validation against
 * the expected performed action. Datum construction failures land on
 * `errorKey` (defaults to `key`) with `fallbackMessage`.
 */
export function validateOutputStateDatum(
  errors: FieldErrors,
  makeStateForm: () => StateFormState,
  alternative: StateActionAlternative,
  options: { key: string; errorKey?: string; fallbackMessage: string }
): void {
  try {
    const outputStateDatum = stateFormToDatum(makeStateForm(), alternative);
    appendValidationErrors(
      errors,
      options.key,
      validateStateDatum(outputStateDatum, { expectedPerformedAction: alternative })
    );
  } catch (error) {
    pushFieldError(
      errors,
      options.errorKey ?? options.key,
      extractErrorMessage(error, options.fallbackMessage)
    );
  }
}

/** The four collection surfaces shared by the use / update / manage tabs. */
export function validateSpendCollections(
  errors: FieldErrors,
  collections: {
    sttWalletInputs: WalletInputRef[];
    sttWalletOutputs: WalletScriptOutputFormState[];
    sttExtraTransfers: TransferFormState[];
    sttOutputAssets: Asset[];
  }
): void {
  validateWalletInputRefs(errors, FIELD_ERROR_IDS.selectedFundPools, collections.sttWalletInputs);
  validateWalletScriptOutputs(errors, FIELD_ERROR_IDS.resultingFundPools, collections.sttWalletOutputs);
  validateTransferRows(errors, FIELD_ERROR_IDS.recipients, collections.sttExtraTransfers);
  validateAssetRows(errors, FIELD_ERROR_IDS.outputAssets, collections.sttOutputAssets);
}
