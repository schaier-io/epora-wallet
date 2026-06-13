// Pure per-action field validation extracted from permission-wallet-workspace.tsx.
import { type FieldErrors, type UserActionKind } from "@/components/user/flow-types";
import { MINT_PERFORMED_ACTION, NON_NEGATIVE_INTEGER_SCHEMA, OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA, RENEW_PROOF_OF_LIFE_ACTION, REQUIRED_TEXT_SCHEMA } from "@/components/user/workspace/constants";
import { appendValidationErrors, cloneStateForm, hasPositiveAssetAmount, pushFieldError, resolveConsolidateActionAlternative, resolveManageStreamingPaymentsActionAlternative, resolveOperatorActionAlternative, resolveUpdateStateActionAlternative, resolveUseActionAlternative, resolveProofOfLifeOverrideTimestamp, resolveWalletWrapperSttInputRef, serializeRequiredConstrPreset, serializeTransfers, serializeWalletOutputs, validateAssetRows, validateField, validateTransferRows, validateWalletInputRefs, validateWalletScriptOutputs, walletNameAlreadyExists } from "@/components/user/workspace/helpers";
import { type RequiredConstrPresetForm, type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { type ProofOfLifeOverrideMode, type StateFormState, applyProofOfLifeOverrideToStateForm, countAdminUsersInStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import { validateMintStateDatum, validateStateDatum } from "@/lib/contracts/state-validation";
import { MAX_WALLET_NAME_BYTES, normalizeWalletName, walletNameByteLength } from "@/lib/contracts/state-wallet-name";
import { type DetectedSttToken } from "@/lib/mesh/detection";
import { getValidityWindow } from "@/lib/mesh/transactions";
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
      const specificTimestamp = resolveProofOfLifeOverrideTimestamp(
        sttProofOfLifeOverrideMode,
        sttProofOfLifeSpecificDateTime,
        "Choose a wake-up timer date before building this action."
      );

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
        error instanceof Error ? error.message : "Wallet rules are invalid."
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
    if (countAdminUsersInStateForm(mintStateForm) === 0 && !mintZeroAdminConfirmed) {
      pushFieldError(
        mintErrors,
        "Zero-admin confirmation",
        "Confirm the zero-admin state before building mint."
      );
    }

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
    validateField(
      consolidateErrors,
      "STT input tx hash",
      REQUIRED_TEXT_SCHEMA,
      consolidateSttInputHash
    );
    validateField(
      consolidateErrors,
      "STT input index",
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      consolidateSttInputIndex
    );
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
        error instanceof Error ? error.message : "Consolidation inputs are invalid."
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
        error instanceof Error ? error.message : "Wallet spend inputs are invalid."
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
    validateField(withdrawErrors, "STT input tx hash", REQUIRED_TEXT_SCHEMA, withdrawSttRef.txHash);
    validateField(
      withdrawErrors,
      "STT input index",
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      withdrawSttRef.indexStr
    );
    validateAssetRows(withdrawErrors, "Forwarded STT assets", withdrawSttAssets);
    try {
      const withdrawStateDatum = stateFormToDatum(
        cloneStateForm(withdrawSttStateForm),
        operatorActionAlternative
      );
      appendValidationErrors(
        withdrawErrors,
        "Forwarded STT state",
        validateStateDatum(withdrawStateDatum, {
          expectedPerformedAction: operatorActionAlternative
        })
      );
    } catch (error) {
      pushFieldError(
        withdrawErrors,
        "Forwarded STT state",
        error instanceof Error ? error.message : "Forwarded STT state is invalid."
      );
    }
    if (countAdminUsersInStateForm(withdrawSttStateForm) === 0 && !withdrawZeroAdminConfirmed) {
      pushFieldError(
        withdrawErrors,
        "Zero-admin confirmation",
        "Confirm the zero-admin state before building the staking withdrawal."
      );
    }

    const publishErrors: FieldErrors = {};
    validateField(
      publishErrors,
      "Certificate JSON",
      REQUIRED_TEXT_SCHEMA,
      publishCertificateJson
    );
    const publishSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      publishSttInputHash,
      publishSttInputIndex
    );
    validateField(publishErrors, "STT input tx hash", REQUIRED_TEXT_SCHEMA, publishSttRef.txHash);
    validateField(
      publishErrors,
      "STT input index",
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      publishSttRef.indexStr
    );
    const publishGovernanceStateForm = selectedDetectedTokenStateForm
      ? cloneStateForm(selectedDetectedTokenStateForm)
      : cloneStateForm(publishSttStateForm);
    validateAssetRows(publishErrors, "Forwarded STT assets", publishSttAssets);
    try {
      JSON.parse(publishCertificateJson);
      const publishStateDatum = stateFormToDatum(
        cloneStateForm(publishGovernanceStateForm),
        operatorActionAlternative
      );
      appendValidationErrors(
        publishErrors,
        "Forwarded STT state",
        validateStateDatum(publishStateDatum, {
          expectedPerformedAction: operatorActionAlternative
        })
      );
    } catch (error) {
      pushFieldError(
        publishErrors,
        "Publish",
        error instanceof Error ? error.message : "Publish inputs are invalid."
      );
    }
    if (
      !selectedDetectedToken &&
      countAdminUsersInStateForm(publishGovernanceStateForm) === 0 &&
      !publishZeroAdminConfirmed
    ) {
      pushFieldError(
        publishErrors,
        "Zero-admin confirmation",
        "Confirm the zero-admin state before building publish."
      );
    }

    const proposeErrors: FieldErrors = {};
    validateField(
      proposeErrors,
      "Proposal JSON",
      REQUIRED_TEXT_SCHEMA,
      proposalJson
    );
    const proposeSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      proposalSttInputHash,
      proposalSttInputIndex
    );
    validateField(proposeErrors, "STT input tx hash", REQUIRED_TEXT_SCHEMA, proposeSttRef.txHash);
    validateField(
      proposeErrors,
      "STT input index",
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      proposeSttRef.indexStr
    );
    const proposeGovernanceStateForm = selectedDetectedTokenStateForm
      ? cloneStateForm(selectedDetectedTokenStateForm)
      : cloneStateForm(proposalSttStateForm);
    validateAssetRows(proposeErrors, "Forwarded STT assets", proposalSttAssets);
    try {
      JSON.parse(proposalJson);
      const proposalStateDatum = stateFormToDatum(
        cloneStateForm(proposeGovernanceStateForm),
        operatorActionAlternative
      );
      appendValidationErrors(
        proposeErrors,
        "Forwarded STT state",
        validateStateDatum(proposalStateDatum, {
          expectedPerformedAction: operatorActionAlternative
        })
      );
    } catch (error) {
      pushFieldError(
        proposeErrors,
        "Proposal",
        error instanceof Error ? error.message : "Proposal inputs are invalid."
      );
    }
    if (
      !selectedDetectedToken &&
      countAdminUsersInStateForm(proposeGovernanceStateForm) === 0 &&
      !proposalZeroAdminConfirmed
    ) {
      pushFieldError(
        proposeErrors,
        "Zero-admin confirmation",
        "Confirm the zero-admin state before building propose."
      );
    }

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
