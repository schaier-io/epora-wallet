// Per-action field validation for the STT "spend" action family
// (use / renew-proof-of-life / update-state / manage-streaming-payments /
// use-beneficiary / use-allowance / payout-streaming-payment).
// Shared field patterns live in action-validation-shared.ts.
import { type FieldErrors } from "@/components/user/flow-types";
import { BENEFICIARY_WITHDRAWAL_ACTION, type RENEW_PROOF_OF_LIFE_ACTION, STREAMING_PAYMENT_PAYOUT_ACTION } from "@/components/user/workspace/constants";
import { appendValidationErrors, cloneStateForm, pushFieldError, type resolveManageStreamingPaymentsActionAlternative, type resolveUpdateStateActionAlternative, type resolveUseActionAlternative, serializeTransfers, serializeWalletOutputs, validateTransferRows, validateWalletInputRefs } from "@/components/user/workspace/helpers";
import {
  requireZeroAdminConfirmation,
  validateOutputStateDatum,
  validateSpecificWakeUpDate,
  validateSpendCollections,
  validateSttInputRef
} from "@/components/user/workspace/action-validation-shared";
import { type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { type StateFormState, stateFormToDatum } from "@/lib/contracts/state-form";
import {
  validateStateDatum
} from "@/lib/contracts/state-validation";
import { validateManagedStreamingPaymentsStatic } from "@/lib/contracts/streaming-manage";
import { extractErrorMessage } from "@/lib/utils/errors";
import { type ActionFieldErrorsInput } from "@/components/user/workspace/action-validation";

export type SpendActionValidationContext = {
  useActionAlternative: ReturnType<typeof resolveUseActionAlternative>;
  renewProofOfLifeActionAlternative: typeof RENEW_PROOF_OF_LIFE_ACTION;
  updateStateActionAlternative: ReturnType<typeof resolveUpdateStateActionAlternative>;
  manageStreamingPaymentsActionAlternative: ReturnType<
    typeof resolveManageStreamingPaymentsActionAlternative
  >;
  proofOfLifeRenewalMatchCount: number;
  resolveEffectiveProofOfLifeState: () => StateFormState;
  walletNameChanged: boolean;
};

function validateAdvancedSerialization(
  errors: FieldErrors,
  walletOutputs: WalletScriptOutputFormState[],
  transfers: TransferFormState[]
) {
  try {
    serializeWalletOutputs(walletOutputs);
    serializeTransfers(transfers);
  } catch (error) {
    pushFieldError(
      errors,
      "Advanced options",
      extractErrorMessage(error, "Some advanced inputs are invalid.")
    );
  }
}

export function appendStreamingPaymentPayoutDraftErrors(
  errors: FieldErrors,
  input: Pick<
    ActionFieldErrorsInput,
    | "streamingPaymentPayoutRows"
    | "streamingPaymentPayoutTransfers"
    | "sttWalletInputs"
  >
) {
  const {
    streamingPaymentPayoutRows,
    streamingPaymentPayoutTransfers,
    sttWalletInputs
  } = input;

  // Wallet inputs are optional. With none selected, Mesh funds the tagged
  // outputs from the connected wallet while only the STT script is spent.
  validateWalletInputRefs(errors, "Locked contract inputs", sttWalletInputs);
  const hasZeroDeltaCleanup = streamingPaymentPayoutRows.some(
    (row) => row.cleanupRequired
  );
  if (streamingPaymentPayoutTransfers.length === 0 && !hasZeroDeltaCleanup) {
    pushFieldError(
      errors,
      "StreamingPayment payout",
      "Select at least one scheduled payment payout amount greater than zero, or clean up a fully settled schedule."
    );
  }

  for (const row of streamingPaymentPayoutRows) {
    const nextAmount = row.configuredAmount.trim();
    if (!/^\d+$/.test(nextAmount)) {
      pushFieldError(
        errors,
        `StreamingPayment ${row.streamingPayment.id}`,
        "Enter a whole-number payout amount."
      );
      continue;
    }

    if (BigInt(nextAmount) > BigInt(row.dueAmount || "0")) {
      pushFieldError(
        errors,
        `StreamingPayment ${row.streamingPayment.id}`,
        "Payout amount cannot exceed the currently due amount."
      );
    }
  }
}

export function computeSpendActionErrors(
  input: ActionFieldErrorsInput,
  ctx: SpendActionValidationContext
) {
  const {
    activeInferredSttStateForm,
    activePaymentKeyHash,
    streamingPaymentPayoutRows,
    streamingPaymentPayoutTransfers,
    sttAuthorityPath,
    sttExtraTransfers,
    sttInputOutputIndex,
    sttInputTxHash,
    sttOutputAssets,
    sttProofOfLifeOverrideMode,
    sttProofOfLifeSpecificDateTime,
    sttStateForm,
    sttWalletInputs,
    sttWalletOutputs,
    sttZeroAdminConfirmed,
    useAllowancePreview
  } = input;
  const {
    useActionAlternative,
    renewProofOfLifeActionAlternative,
    updateStateActionAlternative,
    manageStreamingPaymentsActionAlternative,
    proofOfLifeRenewalMatchCount,
    resolveEffectiveProofOfLifeState,
    walletNameChanged
  } = ctx;
  const spendCollections = { sttWalletInputs, sttWalletOutputs, sttExtraTransfers, sttOutputAssets };

  const useErrors: FieldErrors = {};
  validateSttInputRef(useErrors, sttInputTxHash, sttInputOutputIndex);
  validateSpendCollections(useErrors, spendCollections);
  // Not inside `validateSpendCollections`: `update-state` and `manage-streaming-payments`
  // share it and legitimately send nothing.
  validateTransferRows(useErrors, "Transfers / forwarded outputs", sttExtraTransfers, 1);
  validateSpecificWakeUpDate(useErrors, sttProofOfLifeOverrideMode, sttProofOfLifeSpecificDateTime);
  validateOutputStateDatum(useErrors, resolveEffectiveProofOfLifeState, useActionAlternative, {
    key: "Output state",
    fallbackMessage: "Output state is invalid."
  });
  requireZeroAdminConfirmation(useErrors, activeInferredSttStateForm, sttZeroAdminConfirmed, "Use");
  validateAdvancedSerialization(useErrors, sttWalletOutputs, sttExtraTransfers);

  const renewProofOfLifeErrors: FieldErrors = {};
  validateSttInputRef(renewProofOfLifeErrors, sttInputTxHash, sttInputOutputIndex);
  if (!activePaymentKeyHash) {
    pushFieldError(
      renewProofOfLifeErrors,
      "Connected payment key hash",
      "Connect a wallet payment key hash before building Renew Wake-up timer."
    );
  } else if (proofOfLifeRenewalMatchCount === 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      "Wake-up timer renewal",
      "The connected wallet is not allowed to renew the wake-up timer."
    );
  }
  if (sttWalletInputs.length > 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      "Locked contract inputs",
      "Renew Wake-up timer cannot redeem locked contract inputs."
    );
  }
  if (sttWalletOutputs.length > 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      "Locked contract outputs",
      "Renew Wake-up timer cannot create locked contract outputs."
    );
  }
  if (sttExtraTransfers.length > 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      "Transfers / forwarded outputs",
      "Renew Wake-up timer cannot create forwarded transfer outputs."
    );
  }
  if (sttOutputAssets.length > 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      "Output assets",
      "Renew Wake-up timer forwards the STT asset bundle automatically."
    );
  }
  validateSpecificWakeUpDate(
    renewProofOfLifeErrors,
    sttProofOfLifeOverrideMode,
    sttProofOfLifeSpecificDateTime
  );
  // Kept as one try-block on purpose: datum, state validation, and the
  // serialization dry-run all report under "Wake-up timer renewal" here.
  try {
    const outputStateDatum = stateFormToDatum(
      resolveEffectiveProofOfLifeState(),
      renewProofOfLifeActionAlternative
    );
    appendValidationErrors(
      renewProofOfLifeErrors,
      "Output state",
      validateStateDatum(outputStateDatum, {
        expectedPerformedAction: renewProofOfLifeActionAlternative
      })
    );
    serializeWalletOutputs(sttWalletOutputs);
    serializeTransfers(sttExtraTransfers);
  } catch (error) {
    pushFieldError(
      renewProofOfLifeErrors,
      "Wake-up timer renewal",
      extractErrorMessage(error, "The wake-up timer check-in details are not valid.")
    );
  }

  const updateErrors: FieldErrors = {};
  validateSttInputRef(updateErrors, sttInputTxHash, sttInputOutputIndex);
  validateSpendCollections(updateErrors, spendCollections);
  validateOutputStateDatum(updateErrors, () => cloneStateForm(sttStateForm), updateStateActionAlternative, {
    key: "Output state",
    fallbackMessage: "Output state is invalid."
  });
  requireZeroAdminConfirmation(updateErrors, sttStateForm, sttZeroAdminConfirmed, "Update State");
  if (walletNameChanged && sttAuthorityPath !== "admin") {
    pushFieldError(
      updateErrors,
      "Output state",
      "Only the owner path can rename this wallet."
    );
  }
  validateAdvancedSerialization(updateErrors, sttWalletOutputs, sttExtraTransfers);

  const manageStreamingPaymentsErrors: FieldErrors = {};
  validateSttInputRef(manageStreamingPaymentsErrors, sttInputTxHash, sttInputOutputIndex);
  validateSpendCollections(manageStreamingPaymentsErrors, spendCollections);
  validateOutputStateDatum(
    manageStreamingPaymentsErrors,
    () => cloneStateForm(sttStateForm),
    manageStreamingPaymentsActionAlternative,
    { key: "Output state", fallbackMessage: "Output state is invalid." }
  );
  try {
    appendValidationErrors(
      manageStreamingPaymentsErrors,
      "Output state",
      validateManagedStreamingPaymentsStatic(
        stateFormToDatum(activeInferredSttStateForm),
        stateFormToDatum(sttStateForm)
      )
    );
  } catch {
    // The shared output-state serializer above reports the actionable form error.
  }
  requireZeroAdminConfirmation(
    manageStreamingPaymentsErrors,
    sttStateForm,
    sttZeroAdminConfirmed,
    "Manage scheduled payments"
  );
  if (walletNameChanged) {
    pushFieldError(
      manageStreamingPaymentsErrors,
      "Output state",
      "Scheduled payment changes cannot rename the wallet."
    );
  }
  validateAdvancedSerialization(manageStreamingPaymentsErrors, sttWalletOutputs, sttExtraTransfers);

  const limitedErrors: FieldErrors = {};
  validateSttInputRef(limitedErrors, sttInputTxHash, sttInputOutputIndex);
  validateWalletInputRefs(limitedErrors, "Locked contract inputs", sttWalletInputs);
  validateTransferRows(limitedErrors, "Transfers / forwarded outputs", sttExtraTransfers, 1);
  try {
    stateFormToDatum(
      cloneStateForm(activeInferredSttStateForm),
      BENEFICIARY_WITHDRAWAL_ACTION
    );
    serializeTransfers(sttExtraTransfers);
  } catch (error) {
    pushFieldError(
      limitedErrors,
      "Limited withdrawal",
      extractErrorMessage(error, "Limited withdrawal inputs are invalid.")
    );
  }

  const useAllowanceErrors: FieldErrors = {};
  validateSttInputRef(useAllowanceErrors, sttInputTxHash, sttInputOutputIndex);
  validateWalletInputRefs(useAllowanceErrors, "Locked contract inputs", sttWalletInputs, 1);
  if (!activePaymentKeyHash) {
    pushFieldError(
      useAllowanceErrors,
      "Connected payment key hash",
      "Connect a wallet payment key hash before building Allowance Withdrawal."
    );
  }
  validateTransferRows(useAllowanceErrors, "Transfers / forwarded outputs", sttExtraTransfers, 1);
  if (useAllowancePreview.error) {
    pushFieldError(useAllowanceErrors, "Limited withdrawal", useAllowancePreview.error);
  }
  try {
    serializeTransfers(sttExtraTransfers);
  } catch (error) {
    pushFieldError(
      useAllowanceErrors,
      "Limited withdrawal",
      extractErrorMessage(error, "Allowance Withdrawal inputs are invalid.")
    );
  }

  const streamingPaymentErrors: FieldErrors = {};
  validateSttInputRef(streamingPaymentErrors, sttInputTxHash, sttInputOutputIndex);
  appendStreamingPaymentPayoutDraftErrors(streamingPaymentErrors, {
    streamingPaymentPayoutRows,
    streamingPaymentPayoutTransfers,
    sttWalletInputs
  });
  try {
    stateFormToDatum(
      cloneStateForm(activeInferredSttStateForm),
      STREAMING_PAYMENT_PAYOUT_ACTION
    );
  } catch (error) {
    pushFieldError(
      streamingPaymentErrors,
      "StreamingPayment payout",
      extractErrorMessage(error, "Scheduled payment payout inputs are invalid.")
    );
  }

  return {
    useErrors,
    renewProofOfLifeErrors,
    updateErrors,
    manageStreamingPaymentsErrors,
    limitedErrors,
    useAllowanceErrors,
    streamingPaymentErrors
  };
}
