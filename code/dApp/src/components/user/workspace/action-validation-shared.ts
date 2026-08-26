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
 * An action that would leave the wallet with no owner needs an explicit confirmation.
 *
 * The sentence used to end "…before building <label>", where the label was an internal id
 * ("Use", "Update State", "mint") and no button on the surface has ever said "Build". The
 * primary button names the action already, so the message points at the checkbox instead.
 */
export function requireZeroAdminConfirmation(
  errors: FieldErrors,
  stateForm: StateFormState,
  confirmed: boolean
): void {
  if (countAdminUsersInStateForm(stateForm) === 0 && !confirmed) {
    pushFieldError(
      errors,
      "Wallet with no owner",
      "Confirm that this wallet will have no owner before you continue."
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
  validateWalletInputRefs(errors, "Fund pools", collections.sttWalletInputs);
  validateWalletScriptOutputs(errors, "New fund pools", collections.sttWalletOutputs);
  validateTransferRows(errors, "Transfers / forwarded outputs", collections.sttExtraTransfers);
  validateAssetRows(errors, "Output assets", collections.sttOutputAssets);
}

/**
 * The `Vote JSON` shape check. `{}` parses, so the old `JSON.parse` on its own let an
 * empty vote reach a wallet signature. Mesh's `VoteType` needs all three parts, and its
 * serializer reports none of them: `toCardanoVoter` is a switch with no default branch,
 * so a missing `voter` becomes `undefined`, and a missing `govActionId` throws a raw
 * TypeError out of `addBasicVote` after the reader has already pressed Preview.
 */
export function validateGovernanceVotePayload(errors: FieldErrors, voteJson: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(voteJson);
  } catch {
    // The caller's own try/catch reports unparseable JSON under the "Vote" key.
    return;
  }
  const vote =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  if (vote === null || !vote.voter || !vote.govActionId || !vote.votingProcedure) {
    // One sentence, not two: the field's own helper sits directly above the box and already
    // says where a whole vote comes from, so repeating that here printed the same advice
    // twice, once in grey and once in red, on first load.
    pushFieldError(
      errors,
      "Vote JSON",
      "A vote has to say who is voting, which proposal, and how you vote."
    );
    return;
  }
  const voteKind = (vote.votingProcedure as { voteKind?: unknown }).voteKind;
  if (voteKind !== "Yes" && voteKind !== "No" && voteKind !== "Abstain") {
    pushFieldError(errors, "Vote JSON", "The vote has to be Yes, No or Abstain.");
  }
}
