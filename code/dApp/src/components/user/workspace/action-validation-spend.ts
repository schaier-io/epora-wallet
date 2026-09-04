// Per-action field validation for the STT "spend" action family
// (use / renew-proof-of-life / update-state / manage-streaming-payments /
// use-beneficiary / use-allowance / payout-streaming-payment).
// Shared field patterns live in action-validation-shared.ts.
import { type FieldErrors } from "@/components/user/flow-types";
import { BENEFICIARY_WITHDRAWAL_ACTION, type RENEW_PROOF_OF_LIFE_ACTION, STREAMING_PAYMENT_PAYOUT_ACTION } from "@/components/user/workspace/constants";
import { appendValidationErrors, cloneStateForm, pushFieldError, type resolveManageStreamingPaymentsActionAlternative, resolveSttFundPoolInputs, type resolveUpdateStateActionAlternative, type resolveUseActionAlternative, serializeTransfers, serializeWalletOutputs, validateTransferRows, validateWalletInputRefs } from "@/components/user/workspace/helpers";
import {
  requireZeroAdminConfirmation,
  validateOutputStateDatum,
  validateSpecificProofOfLifeDate,
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
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceActionValidationSpend.json";

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
      i18n("advancedOptions"),
      extractErrorMessage(error, i18n("someAdvancedInputsAreInvalid"))
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
  validateWalletInputRefs(errors, "Fund pools", sttWalletInputs);
  const hasZeroDeltaCleanup = streamingPaymentPayoutRows.some(
    (row) => row.cleanupRequired
  );
  if (streamingPaymentPayoutTransfers.length === 0 && !hasZeroDeltaCleanup) {
    pushFieldError(
      errors,
      i18n("streamingpaymentPayout"),
      i18n("selectAtLeastOneScheduledPaymentPayoutAmount")
    );
  }

  // Number rows the way the payout view heads them (1-based), not by on-chain id.
  for (const [index, row] of streamingPaymentPayoutRows.entries()) {
    const nextAmount = row.configuredAmount.trim();
    if (!/^\d+$/.test(nextAmount)) {
      pushFieldError(
        errors,
        i18n("streamingpaymentValue1", { value1: String(index + 1) }),
        i18n("enterAWholeNumberPayoutAmount")
      );
      continue;
    }

    if (BigInt(nextAmount) > BigInt(row.dueAmount || "0")) {
      pushFieldError(
        errors,
        i18n("streamingpaymentValue1", { value1: String(index + 1) }),
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
  const collectionsWithoutFundPoolInputs = {
    ...spendCollections,
    sttWalletInputs: resolveSttFundPoolInputs("update-state", sttWalletInputs)
  };

  const useErrors: FieldErrors = {};
  validateSttInputRef(useErrors, sttInputTxHash, sttInputOutputIndex);
  validateSpendCollections(useErrors, spendCollections);
  // Not inside `validateSpendCollections`: `update-state` and `manage-streaming-payments`
  // share it and legitimately send nothing.
  validateTransferRows(useErrors, "Transfers / forwarded outputs", sttExtraTransfers, 1);
  validateSpecificProofOfLifeDate(useErrors, sttProofOfLifeOverrideMode, sttProofOfLifeSpecificDateTime);
  validateOutputStateDatum(useErrors, resolveEffectiveProofOfLifeState, useActionAlternative, {
    key: "Output state",
    fallbackMessage: i18n("outputStateIsInvalid")
  });
  requireZeroAdminConfirmation(useErrors, activeInferredSttStateForm, sttZeroAdminConfirmed);
  validateAdvancedSerialization(useErrors, sttWalletOutputs, sttExtraTransfers);

  const renewProofOfLifeErrors: FieldErrors = {};
  validateSttInputRef(renewProofOfLifeErrors, sttInputTxHash, sttInputOutputIndex);
  if (!activePaymentKeyHash) {
    pushFieldError(
      renewProofOfLifeErrors,
      i18n("connectedPaymentKeyHash"),
      i18n("connectAWalletBeforeYouContinueRenewingThe")
    );
  } else if (proofOfLifeRenewalMatchCount === 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      i18n("proofOfLifeRenewal"),
      i18n("theConnectedWalletIsNotAllowedToRenew")
    );
  }
  if (sttWalletOutputs.length > 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      i18n("newFundPools"),
      i18n("renewingTheProofOfLifeCannotCreateLocked")
    );
  }
  if (sttExtraTransfers.length > 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      i18n("transfersForwardedOutputs"),
      i18n("renewingTheProofOfLifeCannotCreateForwarded")
    );
  }
  if (sttOutputAssets.length > 0) {
    pushFieldError(
      renewProofOfLifeErrors,
      i18n("outputAssets"),
      i18n("renewingTheProofOfLifeForwardsTheStt")
    );
  }
  validateSpecificProofOfLifeDate(
    renewProofOfLifeErrors,
    sttProofOfLifeOverrideMode,
    sttProofOfLifeSpecificDateTime
  );
  // Kept as one try-block on purpose: datum, state validation, and the
  // serialization dry-run all report under "Proof of life renewal" here.
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
      i18n("proofOfLifeRenewal"),
      extractErrorMessage(error, i18n("theProofOfLifeCheckInDetailsAre"))
    );
  }

  const updateErrors: FieldErrors = {};
  validateSttInputRef(updateErrors, sttInputTxHash, sttInputOutputIndex);
  validateSpendCollections(updateErrors, collectionsWithoutFundPoolInputs);
  validateOutputStateDatum(updateErrors, () => cloneStateForm(sttStateForm), updateStateActionAlternative, {
    key: "Output state",
    fallbackMessage: i18n("outputStateIsInvalid")
  });
  requireZeroAdminConfirmation(updateErrors, sttStateForm, sttZeroAdminConfirmed);
  if (walletNameChanged && sttAuthorityPath !== "admin") {
    pushFieldError(
      updateErrors,
      i18n("outputState"),
      i18n("onlyTheOwnerPathCanRenameThisWallet")
    );
  }
  validateAdvancedSerialization(updateErrors, sttWalletOutputs, sttExtraTransfers);

  const manageStreamingPaymentsErrors: FieldErrors = {};
  validateSttInputRef(manageStreamingPaymentsErrors, sttInputTxHash, sttInputOutputIndex);
  validateSpendCollections(manageStreamingPaymentsErrors, collectionsWithoutFundPoolInputs);
  validateOutputStateDatum(
    manageStreamingPaymentsErrors,
    () => cloneStateForm(sttStateForm),
    manageStreamingPaymentsActionAlternative,
    { key: "Output state", fallbackMessage: i18n("outputStateIsInvalid") }
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
    sttZeroAdminConfirmed
  );
  if (walletNameChanged) {
    pushFieldError(
      manageStreamingPaymentsErrors,
      i18n("outputState"),
      i18n("scheduledPaymentChangesCannotRenameTheWallet")
    );
  }
  validateAdvancedSerialization(manageStreamingPaymentsErrors, sttWalletOutputs, sttExtraTransfers);

  const limitedErrors: FieldErrors = {};
  validateSttInputRef(limitedErrors, sttInputTxHash, sttInputOutputIndex);
  validateWalletInputRefs(limitedErrors, "Fund pools", sttWalletInputs);
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
      i18n("limitedWithdrawal"),
      extractErrorMessage(error, i18n("limitedWithdrawalInputsAreInvalid"))
    );
  }

  const useAllowanceErrors: FieldErrors = {};
  validateSttInputRef(useAllowanceErrors, sttInputTxHash, sttInputOutputIndex);
  validateWalletInputRefs(useAllowanceErrors, "Fund pools", sttWalletInputs, 1);
  if (!activePaymentKeyHash) {
    pushFieldError(
      useAllowanceErrors,
      i18n("connectedPaymentKeyHash"),
      i18n("connectAWalletBeforeYouContinueSendingFrom")
    );
  }
  validateTransferRows(useAllowanceErrors, "Transfers / forwarded outputs", sttExtraTransfers, 1);
  if (useAllowancePreview.error) {
    pushFieldError(useAllowanceErrors, i18n("limitedWithdrawal"), useAllowancePreview.error);
  }
  try {
    serializeTransfers(sttExtraTransfers);
  } catch (error) {
    pushFieldError(
      useAllowanceErrors,
      i18n("limitedWithdrawal"),
      extractErrorMessage(error, i18n("allowanceWithdrawalInputsAreInvalid"))
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
      i18n("streamingpaymentPayout"),
      extractErrorMessage(error, i18n("scheduledPaymentPayoutInputsAreInvalid"))
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
