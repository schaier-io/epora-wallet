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
import { hasIntendedStakeCredential } from "@/lib/contracts/state-layout";
import { extractErrorMessage } from "@/lib/utils/errors";
import { type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { type Asset, type WalletInputRef } from "@/lib/types/contracts";

type StateActionAlternative = Parameters<typeof stateFormToDatum>[1];

/** The `STT input tx hash` + `STT input index` field pair every STT action carries. */
export function validateSttInputRef(
  errors: FieldErrors,
  txHash: string,
  indexStr: string
): void {
  validateField(errors, "STT input tx hash", REQUIRED_TEXT_SCHEMA, txHash);
  validateField(errors, "STT input index", OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA, indexStr);
}

/**
 * Actions that would leave the wallet with zero admins require an explicit
 * confirmation. `actionLabel` finishes the sentence "…before building <label>."
 */
export function requireZeroAdminConfirmation(
  errors: FieldErrors,
  stateForm: StateFormState,
  confirmed: boolean,
  actionLabel: string
): void {
  if (countAdminUsersInStateForm(stateForm) === 0 && !confirmed) {
    pushFieldError(
      errors,
      "Zero-admin confirmation",
      `Confirm the zero-admin state before building ${actionLabel}.`
    );
  }
}

/**
 * A wallet whose `intended_stake_credential` is `None` delegates to nothing, so it has
 * earned nothing to claim. The claim config view already said so in an amber box, but
 * nothing stopped the build: the receipt read `Status: Ready` beside that warning.
 */
export function requireStakingEnabled(errors: FieldErrors, stateForm: StateFormState): void {
  if (!hasIntendedStakeCredential(stateForm.intendedStakeCredential)) {
    pushFieldError(
      errors,
      "Staking",
      "Staking is not on for this wallet yet, so it has earned nothing to claim. Turn on staking first, then delegate to a pool."
    );
  }
}

/** The "specific" wake-up timer override needs a whole-number local timestamp. */
export function validateSpecificWakeUpDate(
  errors: FieldErrors,
  overrideMode: ProofOfLifeOverrideMode,
  dateTime: string
): void {
  if (overrideMode !== "specific") {
    return;
  }
  validateField(errors, "Specific wake-up timer date", REQUIRED_TEXT_SCHEMA, dateTime);
  const trimmed = dateTime.trim();
  if (trimmed && !/^\d+$/.test(trimmed)) {
    pushFieldError(
      errors,
      "Specific wake-up timer date",
      "Choose a valid local date and time."
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
  validateWalletInputRefs(errors, "Locked contract inputs", collections.sttWalletInputs);
  validateWalletScriptOutputs(errors, "Locked contract outputs", collections.sttWalletOutputs);
  validateTransferRows(errors, "Transfers / forwarded outputs", collections.sttExtraTransfers);
  validateAssetRows(errors, "Output assets", collections.sttOutputAssets);
}
