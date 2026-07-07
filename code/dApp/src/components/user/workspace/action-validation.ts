// Pure per-action field validation extracted from permission-wallet-workspace.tsx.
// Shared field patterns live in action-validation-shared.ts; the STT "spend"
// action family lives in action-validation-spend.ts.
import { type FieldErrors, type UserActionKind } from "@/components/user/flow-types";
import { MINT_PERFORMED_ACTION, RENEW_PROOF_OF_LIFE_ACTION } from "@/components/user/workspace/constants";
import { NON_NEGATIVE_INTEGER_SCHEMA, OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA, REQUIRED_TEXT_SCHEMA, appendValidationErrors, cloneStateForm, hasPositiveAssetAmount, pushFieldError, resolveConsolidateActionAlternative, resolveManageStreamingPaymentsActionAlternative, resolveOperatorActionAlternative, resolveUpdateStateActionAlternative, resolveUseActionAlternative, resolveWalletWrapperSttInputRef, serializeRequiredConstrPreset, serializeTransfers, serializeWalletOutputs, validateAssetRows, validateField, validateTransferRows, validateWalletInputRefs, validateWalletScriptOutputs, walletNameAlreadyExists } from "@/components/user/workspace/helpers";
import {
  requireZeroAdminConfirmation,
  validateOutputStateDatum,
  validateSttInputRef
} from "@/components/user/workspace/action-validation-shared";
import { type RequiredConstrPresetForm, type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { type ProofOfLifeOverrideMode, type StateFormState, applyProofOfLifeOverrideToStateForm, countAdminUsersInStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import { validateMintStateDatum, validateStateDatum } from "@/lib/contracts/state-validation";
import { MAX_WALLET_NAME_BYTES, normalizeWalletName, walletNameByteLength } from "@/lib/contracts/state-wallet-name";
import { type DetectedSttToken } from "@/lib/mesh/detection";
import { getValidityWindow } from "@/lib/mesh/transactions";
import { extractErrorMessage } from "@/lib/utils/errors";
import { type Asset, type AuthorityPath, type ConsolidateAuthorityPath, type OperatorAuthorityPath, type PayoutTransfer, type WalletInputRef } from "@/lib/types/contracts";
import { computeSpendActionErrors } from "@/components/user/workspace/action-validation-spend";

export type ActionFieldErrorsInput = {
  activeInferredSttStateForm: StateFormState;
  activePaymentKeyHash: string | null;
  consolidateAuthorityPath: ConsolidateAuthorityPath;
  consolidateSttAssets: Asset[];
  consolidateSttInputHash: string;
  consolidateSttInputIndex: string;
  consolidateWalletInputs: WalletInputRef[];
  consolidateWalletOutputs: WalletScriptOutputFormState[];
  existingWalletNames: string[];
  lockFundsAssets: Asset[];
  mintStarterAssets: Asset[];
  mintStateForm: StateFormState;
  mintZeroAdminConfirmed: boolean;
  proposalJson: string;
  proposalSttAssets: Asset[];
  proposalSttInputHash: string;
  proposalSttInputIndex: string;
  proposalSttStateForm: StateFormState;
  proposalZeroAdminConfirmed: boolean;
  publishCertificateJson: string;
  publishSttAssets: Asset[];
  publishSttInputHash: string;
  publishSttInputIndex: string;
  publishSttStateForm: StateFormState;
  publishZeroAdminConfirmed: boolean;
  selectedDetectedToken: DetectedSttToken | null;
  selectedDetectedTokenStateForm: StateFormState | null;
  streamingPaymentPayoutRows: Array<{
    configuredAmount: string;
    dueAmount: string;
    streamingPayment: { id: string };
  }>;
  streamingPaymentPayoutTransfers: PayoutTransfer[];
  sttAuthorityPath: AuthorityPath;
  sttExtraTransfers: TransferFormState[];
  sttInputOutputIndex: string;
  sttInputTxHash: string;
  sttOutputAssets: Asset[];
  sttProofOfLifeOverrideMode: ProofOfLifeOverrideMode;
  sttProofOfLifeSpecificDateTime: string;
  sttStateForm: StateFormState;
  sttWalletInputs: WalletInputRef[];
  sttWalletOutputs: WalletScriptOutputFormState[];
  sttZeroAdminConfirmed: boolean;
  useAllowancePreview: { error: string | null };
  walletOperatorPath: OperatorAuthorityPath;
  walletSpendInputHash: string;
  walletSpendInputIndex: string;
  walletSpendOutputs: TransferFormState[];
  walletSpendRedeemerPreset: RequiredConstrPresetForm;
  withdrawAmount: string;
  withdrawRewardAddress: string;
  withdrawSttAssets: Asset[];
  withdrawSttInputHash: string;
  withdrawSttInputIndex: string;
  withdrawSttStateForm: StateFormState;
  withdrawZeroAdminConfirmed: boolean;
};

// wallet-publish and wallet-propose validate identically apart from labels and
// which JSON field / STT ref they read — one implementation, two call sites.
function computeGovernanceActionErrors(args: {
  jsonFieldLabel: string;
  jsonValue: string;
  catchKey: string;
  fallbackMessage: string;
  zeroAdminLabel: string;
  zeroAdminConfirmed: boolean;
  sttInputHash: string;
  sttInputIndex: string;
  sttAssets: Asset[];
  baseStateForm: StateFormState;
  selectedDetectedToken: DetectedSttToken | null;
  selectedDetectedTokenStateForm: StateFormState | null;
  operatorActionAlternative: ReturnType<typeof resolveOperatorActionAlternative>;
}): FieldErrors {
  const errors: FieldErrors = {};
  validateField(errors, args.jsonFieldLabel, REQUIRED_TEXT_SCHEMA, args.jsonValue);
  const sttRef = resolveWalletWrapperSttInputRef(
    args.selectedDetectedToken,
    args.sttInputHash,
    args.sttInputIndex
  );
  validateSttInputRef(errors, sttRef.txHash, sttRef.indexStr);
  const governanceStateForm = args.selectedDetectedTokenStateForm
    ? cloneStateForm(args.selectedDetectedTokenStateForm)
    : cloneStateForm(args.baseStateForm);
  validateAssetRows(errors, "Forwarded STT assets", args.sttAssets);
  try {
    JSON.parse(args.jsonValue);
    const stateDatum = stateFormToDatum(
      cloneStateForm(governanceStateForm),
      args.operatorActionAlternative
    );
    appendValidationErrors(
      errors,
      "Forwarded STT state",
      validateStateDatum(stateDatum, {
        expectedPerformedAction: args.operatorActionAlternative
      })
    );
  } catch (error) {
    pushFieldError(errors, args.catchKey, extractErrorMessage(error, args.fallbackMessage));
  }
  if (
    !args.selectedDetectedToken &&
    countAdminUsersInStateForm(governanceStateForm) === 0 &&
    !args.zeroAdminConfirmed
  ) {
    pushFieldError(
      errors,
      "Zero-admin confirmation",
      `Confirm the zero-admin state before building ${args.zeroAdminLabel}.`
    );
  }
  return errors;
}

export function computeActionFieldErrors(
  input: ActionFieldErrorsInput
): Record<UserActionKind, FieldErrors> {
  const {
    activeInferredSttStateForm,
    activePaymentKeyHash,
    consolidateAuthorityPath,
    consolidateSttAssets,
    consolidateSttInputHash,
    consolidateSttInputIndex,
    consolidateWalletInputs,
    consolidateWalletOutputs,
    existingWalletNames,
    lockFundsAssets,
    mintStarterAssets,
    mintStateForm,
    mintZeroAdminConfirmed,
    proposalJson,
    proposalSttAssets,
    proposalSttInputHash,
    proposalSttInputIndex,
    proposalSttStateForm,
    proposalZeroAdminConfirmed,
    publishCertificateJson,
    publishSttAssets,
    publishSttInputHash,
    publishSttInputIndex,
    publishSttStateForm,
    publishZeroAdminConfirmed,
    selectedDetectedToken,
    selectedDetectedTokenStateForm,
    sttAuthorityPath,
    sttProofOfLifeOverrideMode,
    sttProofOfLifeSpecificDateTime,
    sttStateForm,
    walletOperatorPath,
    walletSpendInputHash,
    walletSpendInputIndex,
    walletSpendOutputs,
    walletSpendRedeemerPreset,
    withdrawAmount,
    withdrawRewardAddress,
    withdrawSttAssets,
    withdrawSttInputHash,
    withdrawSttInputIndex,
    withdrawSttStateForm,
    withdrawZeroAdminConfirmed,
  } = input;
  const useActionAlternative = resolveUseActionAlternative(sttAuthorityPath);
  const renewProofOfLifeActionAlternative = RENEW_PROOF_OF_LIFE_ACTION;
  const updateStateActionAlternative =
    resolveUpdateStateActionAlternative(sttAuthorityPath);
  const manageStreamingPaymentsActionAlternative =
    resolveManageStreamingPaymentsActionAlternative(sttAuthorityPath);
  const operatorActionAlternative =
    resolveOperatorActionAlternative(walletOperatorPath);
  const consolidateActionAlternative =
    resolveConsolidateActionAlternative(consolidateAuthorityPath);
  const proofOfLifeRenewalMatchCount = activePaymentKeyHash
    ? activeInferredSttStateForm.users.filter(
        (user) =>
          !user.isAdmin &&
          user.canRenewProofOfLife &&
          user.wallets.includes(activePaymentKeyHash)
      ).length
    : 0;

  function resolveEffectiveProofOfLifeState() {
    let specificTimestamp: number | undefined;

    if (sttProofOfLifeOverrideMode === "specific") {
      if (!sttProofOfLifeSpecificDateTime.trim()) {
        throw new Error("Choose a wake-up timer date before building this action.");
      }

      const parsedTimestamp = Number(sttProofOfLifeSpecificDateTime);
      if (!Number.isSafeInteger(parsedTimestamp)) {
        throw new Error(
          "Proof-of-life override date must be a valid local date and time."
        );
      }

      specificTimestamp = Math.trunc(parsedTimestamp);
    }

    return applyProofOfLifeOverrideToStateForm(
      cloneStateForm(activeInferredSttStateForm),
      sttProofOfLifeOverrideMode,
      specificTimestamp,
      getValidityWindow(Date.now()).latestTimeMs
    );
  }

  const walletNameChanged =
    normalizeWalletName(sttStateForm.walletName) !==
    normalizeWalletName(activeInferredSttStateForm.walletName);

  const mintErrors: FieldErrors = {};
  const mintWalletName = mintStateForm.walletName.trim();
  if (!mintWalletName) {
    pushFieldError(mintErrors, "Wallet name", "Name this wallet before creating it.");
  } else if (walletNameByteLength(mintWalletName) > MAX_WALLET_NAME_BYTES) {
    pushFieldError(
      mintErrors,
      "Wallet name",
      `Use a name that fits in ${MAX_WALLET_NAME_BYTES} bytes.`
    );
  } else if (walletNameAlreadyExists(mintWalletName, existingWalletNames)) {
    pushFieldError(
      mintErrors,
      "Wallet name",
      "You already have a wallet with this name. Choose a different name."
    );
  }
  try {
    const mintDatum = stateFormToDatum(
      cloneStateForm(mintStateForm),
      MINT_PERFORMED_ACTION
    );
    appendValidationErrors(mintErrors, "Wallet rules", validateMintStateDatum(mintDatum));
  } catch (error) {
    pushFieldError(
      mintErrors,
      "Wallet rules",
      extractErrorMessage(error, "Wallet rules are invalid.")
    );
  }
  if (mintStarterAssets.length === 0) {
    pushFieldError(mintErrors, "Starter funds", "Add ADA or one asset for the new wallet.");
  }
  validateAssetRows(mintErrors, "Starter funds", mintStarterAssets);
  if (!hasPositiveAssetAmount(mintStarterAssets)) {
    pushFieldError(
      mintErrors,
      "Starter funds",
      "Add at least one amount greater than zero."
    );
  }
  requireZeroAdminConfirmation(mintErrors, mintStateForm, mintZeroAdminConfirmed, "mint");

  const {
    useErrors,
    renewProofOfLifeErrors,
    updateErrors,
    manageStreamingPaymentsErrors,
    limitedErrors,
    useAllowanceErrors,
    streamingPaymentErrors
  } = computeSpendActionErrors(input, {
    useActionAlternative,
    renewProofOfLifeActionAlternative,
    updateStateActionAlternative,
    manageStreamingPaymentsActionAlternative,
    proofOfLifeRenewalMatchCount,
    resolveEffectiveProofOfLifeState,
    walletNameChanged
  });

  const consolidateErrors: FieldErrors = {};
  validateSttInputRef(consolidateErrors, consolidateSttInputHash, consolidateSttInputIndex);
  validateWalletInputRefs(
    consolidateErrors,
    "Wallet script UTxOs",
    consolidateWalletInputs,
    2
  );
  validateWalletScriptOutputs(
    consolidateErrors,
    "Consolidated wallet outputs",
    consolidateWalletOutputs
  );
  validateAssetRows(consolidateErrors, "Forwarded STT assets", consolidateSttAssets);
  try {
    stateFormToDatum(
      cloneStateForm(activeInferredSttStateForm),
      consolidateActionAlternative
    );
    serializeWalletOutputs(consolidateWalletOutputs);
  } catch (error) {
    pushFieldError(
      consolidateErrors,
      "Consolidation",
      extractErrorMessage(error, "Consolidation inputs are invalid.")
    );
  }

  const lockFundsErrors: FieldErrors = {};
  if (lockFundsAssets.length === 0) {
    pushFieldError(lockFundsErrors, "Assets to lock", "Add at least one asset row.");
  }
  validateAssetRows(lockFundsErrors, "Assets to lock", lockFundsAssets);

  const walletSpendErrors: FieldErrors = {};
  validateField(
    walletSpendErrors,
    "Wallet input tx hash",
    REQUIRED_TEXT_SCHEMA,
    walletSpendInputHash
  );
  validateField(
    walletSpendErrors,
    "Wallet input index",
    OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
    walletSpendInputIndex
  );
  if (walletSpendOutputs.length === 0) {
    pushFieldError(walletSpendErrors, "Outputs", "Add at least one output.");
  }
  validateTransferRows(walletSpendErrors, "Outputs", walletSpendOutputs);
  try {
    serializeRequiredConstrPreset(walletSpendRedeemerPreset, "Wallet spend redeemer");
    serializeTransfers(walletSpendOutputs);
  } catch (error) {
    pushFieldError(
      walletSpendErrors,
      "Wallet spend",
      extractErrorMessage(error, "Wallet spend inputs are invalid.")
    );
  }

  const withdrawErrors: FieldErrors = {};
  validateField(
    withdrawErrors,
    "Staking address",
    REQUIRED_TEXT_SCHEMA,
    withdrawRewardAddress
  );
  validateField(
    withdrawErrors,
    "Withdrawal amount",
    NON_NEGATIVE_INTEGER_SCHEMA,
    withdrawAmount
  );
  const withdrawSttRef = resolveWalletWrapperSttInputRef(
    selectedDetectedToken,
    withdrawSttInputHash,
    withdrawSttInputIndex
  );
  validateSttInputRef(withdrawErrors, withdrawSttRef.txHash, withdrawSttRef.indexStr);
  validateAssetRows(withdrawErrors, "Forwarded STT assets", withdrawSttAssets);
  validateOutputStateDatum(
    withdrawErrors,
    () => cloneStateForm(withdrawSttStateForm),
    operatorActionAlternative,
    { key: "Forwarded STT state", fallbackMessage: "Forwarded STT state is invalid." }
  );
  requireZeroAdminConfirmation(
    withdrawErrors,
    withdrawSttStateForm,
    withdrawZeroAdminConfirmed,
    "the staking withdrawal"
  );

  const publishErrors = computeGovernanceActionErrors({
    jsonFieldLabel: "Certificate JSON",
    jsonValue: publishCertificateJson,
    catchKey: "Publish",
    fallbackMessage: "Publish inputs are invalid.",
    zeroAdminLabel: "publish",
    zeroAdminConfirmed: publishZeroAdminConfirmed,
    sttInputHash: publishSttInputHash,
    sttInputIndex: publishSttInputIndex,
    sttAssets: publishSttAssets,
    baseStateForm: publishSttStateForm,
    selectedDetectedToken,
    selectedDetectedTokenStateForm,
    operatorActionAlternative
  });

  const proposeErrors = computeGovernanceActionErrors({
    jsonFieldLabel: "Proposal JSON",
    jsonValue: proposalJson,
    catchKey: "Proposal",
    fallbackMessage: "Proposal inputs are invalid.",
    zeroAdminLabel: "propose",
    zeroAdminConfirmed: proposalZeroAdminConfirmed,
    sttInputHash: proposalSttInputHash,
    sttInputIndex: proposalSttInputIndex,
    sttAssets: proposalSttAssets,
    baseStateForm: proposalSttStateForm,
    selectedDetectedToken,
    selectedDetectedTokenStateForm,
    operatorActionAlternative
  });

  return {
    mint: mintErrors,
    use: useErrors,
    "renew-proof-of-life": renewProofOfLifeErrors,
    "update-state": updateErrors,
    "manage-streaming-payments": manageStreamingPaymentsErrors,
    "use-allowance": useAllowanceErrors,
    "use-beneficiary": limitedErrors,
    "payout-streaming-payment": streamingPaymentErrors,
    "consolidate-utxo": consolidateErrors,
    "lock-funds": lockFundsErrors,
    "wallet-spend": walletSpendErrors,
    "wallet-withdraw": withdrawErrors,
    "wallet-publish": publishErrors,
    "wallet-propose": proposeErrors,
    // Enable-staking takes no free-form fields — it sets the wallet's own
    // staking script as the stake credential, so there is nothing to validate.
    "set-intended-stake-credential": {}
  };
}
