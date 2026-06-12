// Per-action field validation for the STT "spend" action family
// (use / renew-proof-of-life / update-state / manage-streaming-payments /
// use-beneficiary / use-allowance / payout-streaming-payment).
// Extracted verbatim from action-validation.ts to keep each file under the
// 750-line ceiling; behavior is unchanged.
import { type FieldErrors } from "@/components/user/flow-types";
import { BENEFICIARY_WITHDRAWAL_ACTION, OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA, type RENEW_PROOF_OF_LIFE_ACTION, REQUIRED_TEXT_SCHEMA, STREAMING_PAYMENT_PAYOUT_ACTION } from "@/components/user/workspace/constants";
import { appendValidationErrors, cloneStateForm, pushFieldError, type resolveManageStreamingPaymentsActionAlternative, type resolveUpdateStateActionAlternative, type resolveUseActionAlternative, serializeTransfers, serializeWalletOutputs, validateAssetRows, validateField, validateTransferRows, validateWalletInputRefs, validateWalletScriptOutputs } from "@/components/user/workspace/helpers";
import { type StateFormState, countAdminUsersInStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import { validateStateDatum } from "@/lib/contracts/state-validation";
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
    const useErrors: FieldErrors = {};
    validateField(useErrors, "STT input tx hash", REQUIRED_TEXT_SCHEMA, sttInputTxHash);
    validateField(
      useErrors,
      "STT input index",
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      sttInputOutputIndex
    );
    validateWalletInputRefs(useErrors, "Locked contract inputs", sttWalletInputs);
    validateWalletScriptOutputs(useErrors, "Locked contract outputs", sttWalletOutputs);
    validateTransferRows(useErrors, "Transfers / forwarded outputs", sttExtraTransfers);
    validateAssetRows(useErrors, "Output assets", sttOutputAssets);
    if (sttProofOfLifeOverrideMode === "specific") {
      validateField(
        useErrors,
        "Specific wake-up timer date",
        REQUIRED_TEXT_SCHEMA,
        sttProofOfLifeSpecificDateTime
      );

      if (sttProofOfLifeSpecificDateTime.trim()) {
        if (!/^\d+$/.test(sttProofOfLifeSpecificDateTime.trim())) {
          pushFieldError(
            useErrors,
            "Specific wake-up timer date",
            "Choose a valid local date and time."
          );
        }
      }
    }
    try {
      const outputStateDatum = stateFormToDatum(
        resolveEffectiveProofOfLifeState(),
        useActionAlternative
      );
      appendValidationErrors(
        useErrors,
        "Output state",
        validateStateDatum(outputStateDatum, {
          expectedPerformedAction: useActionAlternative
        })
      );
    } catch (error) {
      pushFieldError(
        useErrors,
        "Output state",
        error instanceof Error ? error.message : "Output state is invalid."
      );
    }
    if (countAdminUsersInStateForm(activeInferredSttStateForm) === 0 && !sttZeroAdminConfirmed) {
      pushFieldError(
        useErrors,
        "Zero-admin confirmation",
        "Confirm the zero-admin state before building Use."
      );
    }
    try {
      serializeWalletOutputs(sttWalletOutputs);
      serializeTransfers(sttExtraTransfers);
    } catch (error) {
      pushFieldError(
        useErrors,
        "Advanced options",
        error instanceof Error ? error.message : "Some advanced inputs are invalid."
      );
    }

    const renewProofOfLifeErrors: FieldErrors = {};
    validateField(
      renewProofOfLifeErrors,
      "STT input tx hash",
      REQUIRED_TEXT_SCHEMA,
      sttInputTxHash
    );
    validateField(
      renewProofOfLifeErrors,
      "STT input index",
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      sttInputOutputIndex
    );
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
        "The connected signer does not match a non-admin user with wake-up timer renewal rights."
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
    if (sttProofOfLifeOverrideMode === "specific") {
      validateField(
        renewProofOfLifeErrors,
        "Specific wake-up timer date",
        REQUIRED_TEXT_SCHEMA,
        sttProofOfLifeSpecificDateTime
      );

      if (sttProofOfLifeSpecificDateTime.trim()) {
        if (!/^\d+$/.test(sttProofOfLifeSpecificDateTime.trim())) {
          pushFieldError(
            renewProofOfLifeErrors,
            "Specific wake-up timer date",
            "Choose a valid local date and time."
          );
        }
      }
    }
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
        error instanceof Error ? error.message : "Proof-of-life renewal inputs are invalid."
      );
    }

    const updateErrors: FieldErrors = {};
    validateField(updateErrors, "STT input tx hash", REQUIRED_TEXT_SCHEMA, sttInputTxHash);
    validateField(
      updateErrors,
      "STT input index",
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      sttInputOutputIndex
    );
    validateWalletInputRefs(updateErrors, "Locked contract inputs", sttWalletInputs);
    validateWalletScriptOutputs(updateErrors, "Locked contract outputs", sttWalletOutputs);
    validateTransferRows(updateErrors, "Transfers / forwarded outputs", sttExtraTransfers);
    validateAssetRows(updateErrors, "Output assets", sttOutputAssets);
    try {
      const outputStateDatum = stateFormToDatum(
        cloneStateForm(sttStateForm),
        updateStateActionAlternative
      );
      appendValidationErrors(
        updateErrors,
        "Output state",
        validateStateDatum(outputStateDatum, {
          expectedPerformedAction: updateStateActionAlternative
        })
      );
    } catch (error) {
      pushFieldError(
        updateErrors,
        "Output state",
        error instanceof Error ? error.message : "Output state is invalid."
      );
    }
    if (countAdminUsersInStateForm(sttStateForm) === 0 && !sttZeroAdminConfirmed) {
      pushFieldError(
        updateErrors,
        "Zero-admin confirmation",
        "Confirm the zero-admin state before building Update State."
      );
    }
    if (walletNameChanged && sttAuthorityPath !== "admin") {
      pushFieldError(
        updateErrors,
        "Output state",
        "Only the owner path can rename this wallet."
      );
    }
    try {
      serializeWalletOutputs(sttWalletOutputs);
      serializeTransfers(sttExtraTransfers);
    } catch (error) {
      pushFieldError(
        updateErrors,
        "Advanced options",
        error instanceof Error ? error.message : "Some advanced inputs are invalid."
      );
    }

    const manageStreamingPaymentsErrors: FieldErrors = {};
    validateField(
      manageStreamingPaymentsErrors,
      "STT input tx hash",
      REQUIRED_TEXT_SCHEMA,
      sttInputTxHash
    );
    validateField(
      manageStreamingPaymentsErrors,
      "STT input index",
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      sttInputOutputIndex
    );
    validateWalletInputRefs(
      manageStreamingPaymentsErrors,
      "Locked contract inputs",
      sttWalletInputs
    );
    validateWalletScriptOutputs(
      manageStreamingPaymentsErrors,
      "Locked contract outputs",
      sttWalletOutputs
    );
    validateTransferRows(
      manageStreamingPaymentsErrors,
      "Transfers / forwarded outputs",
      sttExtraTransfers
    );
    validateAssetRows(manageStreamingPaymentsErrors, "Output assets", sttOutputAssets);
    try {
      const outputStateDatum = stateFormToDatum(
        cloneStateForm(sttStateForm),
        manageStreamingPaymentsActionAlternative
      );
      appendValidationErrors(
        manageStreamingPaymentsErrors,
        "Output state",
        validateStateDatum(outputStateDatum, {
          expectedPerformedAction: manageStreamingPaymentsActionAlternative
        })
      );
    } catch (error) {
      pushFieldError(
        manageStreamingPaymentsErrors,
        "Output state",
        error instanceof Error ? error.message : "Output state is invalid."
      );
    }
    if (countAdminUsersInStateForm(sttStateForm) === 0 && !sttZeroAdminConfirmed) {
      pushFieldError(
        manageStreamingPaymentsErrors,
        "Zero-admin confirmation",
        "Confirm the zero-admin state before building Manage streaming payments."
      );
    }
    if (walletNameChanged) {
      pushFieldError(
        manageStreamingPaymentsErrors,
        "Output state",
        "Scheduled payment changes cannot rename the wallet."
      );
    }
    try {
      serializeWalletOutputs(sttWalletOutputs);
      serializeTransfers(sttExtraTransfers);
    } catch (error) {
      pushFieldError(
        manageStreamingPaymentsErrors,
        "Advanced options",
        error instanceof Error ? error.message : "Some advanced inputs are invalid."
      );
    }

    const limitedErrors: FieldErrors = {};
    validateField(limitedErrors, "STT input tx hash", REQUIRED_TEXT_SCHEMA, sttInputTxHash);
    validateField(
      limitedErrors,
      "STT input index",
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      sttInputOutputIndex
    );
    validateWalletInputRefs(limitedErrors, "Locked contract inputs", sttWalletInputs);
    validateTransferRows(limitedErrors, "Transfers / forwarded outputs", sttExtraTransfers);
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
        error instanceof Error ? error.message : "Limited withdrawal inputs are invalid."
      );
    }

    const useAllowanceErrors: FieldErrors = {};
    validateField(
      useAllowanceErrors,
      "STT input tx hash",
      REQUIRED_TEXT_SCHEMA,
      sttInputTxHash
    );
    validateField(
      useAllowanceErrors,
      "STT input index",
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      sttInputOutputIndex
    );
    validateWalletInputRefs(
      useAllowanceErrors,
      "Locked contract inputs",
      sttWalletInputs,
      1
    );
    if (!activePaymentKeyHash) {
      pushFieldError(
        useAllowanceErrors,
        "Connected payment key hash",
        "Connect a wallet payment key hash before building Allowance Withdrawal."
      );
    }
    if (sttExtraTransfers.length === 0) {
      pushFieldError(
        useAllowanceErrors,
        "Transfers / forwarded outputs",
        "Add at least one forwarded transfer."
      );
    }
    validateTransferRows(
      useAllowanceErrors,
      "Transfers / forwarded outputs",
      sttExtraTransfers
    );
    if (useAllowancePreview.error) {
      pushFieldError(
        useAllowanceErrors,
        "Limited withdrawal",
        useAllowancePreview.error
      );
    }
    try {
      serializeTransfers(sttExtraTransfers);
    } catch (error) {
      pushFieldError(
        useAllowanceErrors,
        "Limited withdrawal",
        error instanceof Error ? error.message : "Allowance Withdrawal inputs are invalid."
      );
    }

    const streamingPaymentErrors: FieldErrors = {};
    validateField(
      streamingPaymentErrors,
      "STT input tx hash",
      REQUIRED_TEXT_SCHEMA,
      sttInputTxHash
    );
    validateField(
      streamingPaymentErrors,
      "STT input index",
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      sttInputOutputIndex
    );
    validateWalletInputRefs(streamingPaymentErrors, "Locked contract inputs", sttWalletInputs, 1);
    if (streamingPaymentPayoutTransfers.length === 0) {
      pushFieldError(
        streamingPaymentErrors,
        "StreamingPayment payout",
        "Select at least one streaming payment payout amount greater than zero."
      );
    }
    for (const row of streamingPaymentPayoutRows) {
      const nextAmount = row.configuredAmount.trim();
      if (!/^\d+$/.test(nextAmount)) {
        pushFieldError(
          streamingPaymentErrors,
          `StreamingPayment ${row.streamingPayment.id}`,
          "Enter a whole-number payout amount."
        );
        continue;
      }

      if (BigInt(nextAmount) > BigInt(row.dueAmount || "0")) {
        pushFieldError(
          streamingPaymentErrors,
          `StreamingPayment ${row.streamingPayment.id}`,
          "Payout amount cannot exceed the currently due amount."
        );
      }
    }
    try {
      stateFormToDatum(
        cloneStateForm(activeInferredSttStateForm),
        STREAMING_PAYMENT_PAYOUT_ACTION
      );
    } catch (error) {
      pushFieldError(
        streamingPaymentErrors,
        "StreamingPayment payout",
        error instanceof Error ? error.message : "Streaming payment payout inputs are invalid."
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
