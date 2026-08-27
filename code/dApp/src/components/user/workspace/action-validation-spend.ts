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
import { getUserFacingErrorMessage } from "@/lib/utils/errors";
import { type ActionFieldErrorsInput } from "@/components/user/workspace/action-validation";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceActionValidationSpend.json";
import {
  FIELD_ERROR_IDS,
  scheduledPaymentFieldId
} from "@/components/user/workspace/field-error-ids";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceActionValidationSpend", defaultMessages);

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
      FIELD_ERROR_IDS.advancedOptions,
      getUserFacingErrorMessage(error, i18n("checkTheAdvancedOptionsAndTryAgain"))
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
  validateWalletInputRefs(errors, FIELD_ERROR_IDS.selectedFundPools, sttWalletInputs);
  const hasZeroDeltaCleanup = streamingPaymentPayoutRows.some(
    (row) => row.cleanupRequired
  );
  if (streamingPaymentPayoutTransfers.length === 0 && !hasZeroDeltaCleanup) {
    pushFieldError(
      errors,
      FIELD_ERROR_IDS.scheduledPaymentPayout,
      i18n("selectAtLeastOnePayoutAmountGreaterThan")
    );
  }

  for (const row of streamingPaymentPayoutRows) {
    const nextAmount = row.configuredAmount.trim();
    if (!/^\d+$/.test(nextAmount)) {
      pushFieldError(
        errors,
        scheduledPaymentFieldId(row.streamingPayment.id),
        i18n("enterAWholeNumberPayoutAmount")
      );
      continue;
    }

    if (BigInt(nextAmount) > BigInt(row.dueAmount || "0")) {
      pushFieldError(
        errors,
        scheduledPaymentFieldId(row.streamingPayment.id),
        i18n("payoutAmountCannotExceedTheCurrentlyDueAmount")
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
  validateSpecificWakeUpDate(
    useErrors,
    sttProofOfLifeOverrideMode,
    sttProofOfLifeSpecificDateTime,
    i18n("chooseAValidLocalDateAndTime")
  );
  validateOutputStateDatum(useErrors, resolveEffectiveProofOfLifeState, useActionAlternative, {
    key: FIELD_ERROR_IDS.walletAfterSend,
    fallbackMessage: i18n("checkTheWalletSettingsCarriedIntoThisSend")
  });
  requireZeroAdminConfirmation(
    useErrors,
    activeInferredSttStateForm,
    sttZeroAdminConfirmed,
    i18n("confirmNoDirectOwnerBeforeUsingWallet")
  );
  validateAdvancedSerialization(useErrors, sttWalletOutputs, sttExtraTransfers);

  const renewProofOfLifeErrors: FieldErrors = {};
  validateSttInputRef(renewProofOfLifeErrors, sttInputTxHash, sttInputOutputIndex);
  if (!activePaymentKeyHash) {
    pushFieldError(
      renewProofOfLifeErrors,
      FIELD_ERROR_IDS.connectedSigner,
      i18n("connectABrowserWalletBeforeRefreshingTheWake")
    );
  } else if (proofOfLifeRenewalMatchCount === 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      FIELD_ERROR_IDS.wakeUpTimerRenewal,
      i18n("theConnectedSignerIsNotASpenderWho")
    );
  }
  if (sttWalletInputs.length > 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      FIELD_ERROR_IDS.selectedFundPools,
      i18n("refreshingTheWakeUpTimerCannotSpendWallet")
    );
  }
  if (sttWalletOutputs.length > 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      FIELD_ERROR_IDS.selectedFundPools,
      i18n("refreshingTheWakeUpTimerCannotCreateNew")
    );
  }
  if (sttExtraTransfers.length > 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      FIELD_ERROR_IDS.recipients,
      i18n("refreshingTheWakeUpTimerCannotSendFunds")
    );
  }
  if (sttOutputAssets.length > 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      FIELD_ERROR_IDS.outputAssets,
      i18n("refreshingTheWakeUpTimerPreservesTheWallet")
    );
  }
  validateSpecificWakeUpDate(
    renewProofOfLifeErrors,
    sttProofOfLifeOverrideMode,
    sttProofOfLifeSpecificDateTime,
    i18n("chooseAValidLocalDateAndTime")
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
      FIELD_ERROR_IDS.wakeUpTimer,
      validateStateDatum(outputStateDatum, {
        expectedPerformedAction: renewProofOfLifeActionAlternative
      })
    );
    serializeWalletOutputs(sttWalletOutputs);
    serializeTransfers(sttExtraTransfers);
  } catch (error) {
    pushFieldError(
      renewProofOfLifeErrors,
      FIELD_ERROR_IDS.wakeUpTimerRenewal,
      getUserFacingErrorMessage(error, i18n("checkTheWakeUpTimerSettingsAndTry"))
    );
  }

  const updateErrors: FieldErrors = {};
  validateSttInputRef(updateErrors, sttInputTxHash, sttInputOutputIndex);
  validateSpendCollections(updateErrors, spendCollections);
  validateOutputStateDatum(updateErrors, () => cloneStateForm(sttStateForm), updateStateActionAlternative, {
    key: FIELD_ERROR_IDS.walletSettings,
    fallbackMessage: i18n("checkTheUpdatedWalletSettings")
  });
  requireZeroAdminConfirmation(
    updateErrors,
    sttStateForm,
    sttZeroAdminConfirmed,
    i18n("confirmNoDirectOwnerBeforeUpdatingSettings")
  );
  if (walletNameChanged && sttAuthorityPath !== "admin") {
    pushFieldError(
      updateErrors,
      FIELD_ERROR_IDS.walletName,
      i18n("onlyAnOwnerCanRenameThisWallet")
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
    { key: FIELD_ERROR_IDS.scheduledPayments, fallbackMessage: i18n("checkTheUpdatedPaymentSchedules") }
  );
  try {
    appendValidationErrors(
      manageStreamingPaymentsErrors,
      FIELD_ERROR_IDS.scheduledPayments,
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
    i18n("confirmNoDirectOwnerBeforeChangingScheduledPayments")
  );
  if (walletNameChanged) {
    pushFieldError(
      manageStreamingPaymentsErrors,
      FIELD_ERROR_IDS.outputState,
      i18n("scheduledPaymentChangesCannotRenameTheWallet")
    );
  }
  validateAdvancedSerialization(manageStreamingPaymentsErrors, sttWalletOutputs, sttExtraTransfers);

  const limitedErrors: FieldErrors = {};
  validateSttInputRef(limitedErrors, sttInputTxHash, sttInputOutputIndex);
  validateWalletInputRefs(limitedErrors, FIELD_ERROR_IDS.selectedFundPools, sttWalletInputs);
  validateTransferRows(limitedErrors, FIELD_ERROR_IDS.recipients, sttExtraTransfers);
  try {
    stateFormToDatum(
      cloneStateForm(activeInferredSttStateForm),
      BENEFICIARY_WITHDRAWAL_ACTION
    );
    serializeTransfers(sttExtraTransfers);
  } catch (error) {
    pushFieldError(
      limitedErrors,
      FIELD_ERROR_IDS.recoveryWithdrawal,
      getUserFacingErrorMessage(error, i18n("checkTheRecoveryRecipientAndAmountsThenTry"))
    );
  }

  const useAllowanceErrors: FieldErrors = {};
  validateSttInputRef(useAllowanceErrors, sttInputTxHash, sttInputOutputIndex);
  validateWalletInputRefs(useAllowanceErrors, FIELD_ERROR_IDS.selectedFundPools, sttWalletInputs, 1);
  if (!activePaymentKeyHash) {
    pushFieldError(
      useAllowanceErrors,
      FIELD_ERROR_IDS.connectedSigner,
      i18n("connectABrowserWalletBeforeSendingWithinA")
    );
  }
  if (sttExtraTransfers.length === 0) {
    pushFieldError(
      useAllowanceErrors,
      FIELD_ERROR_IDS.recipients,
      i18n("addAtLeastOneRecipientAndAmount")
    );
  }
  validateTransferRows(useAllowanceErrors, FIELD_ERROR_IDS.recipients, sttExtraTransfers);
  if (useAllowancePreview.error) {
    pushFieldError(useAllowanceErrors, FIELD_ERROR_IDS.spendingAllowance, useAllowancePreview.error);
  }
  try {
    serializeTransfers(sttExtraTransfers);
  } catch (error) {
    pushFieldError(
      useAllowanceErrors,
      FIELD_ERROR_IDS.spendingAllowance,
      getUserFacingErrorMessage(error, i18n("checkTheRecipientAndAmountsThenTryAgain"))
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
      FIELD_ERROR_IDS.scheduledPaymentPayout,
      getUserFacingErrorMessage(error, i18n("checkTheScheduledPaymentAmountsAndTryAgain"))
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
