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
import { getUserFacingErrorMessage } from "@/lib/utils/errors";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceActionValidation.json";
import { FIELD_ERROR_IDS } from "@/components/user/workspace/field-error-ids";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceActionValidation", defaultMessages);

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
  voteJson: string;
  voteSttAssets: Asset[];
  voteSttInputHash: string;
  voteSttInputIndex: string;
  voteSttStateForm: StateFormState;
  voteZeroAdminConfirmed: boolean;
  publishCertificateJson: string;
  publishSttAssets: Asset[];
  publishSttInputHash: string;
  publishSttInputIndex: string;
  publishSttStateForm: StateFormState;
  publishZeroAdminConfirmed: boolean;
  selectedDetectedToken: DetectedSttToken | null;
  selectedDetectedTokenStateForm: StateFormState | null;
  streamingPaymentPayoutRows: Array<{
    cleanupRequired: boolean;
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
    voteJson,
    voteSttAssets,
    voteSttInputHash,
    voteSttInputIndex,
    voteSttStateForm,
    voteZeroAdminConfirmed,
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
        i18n("chooseAWakeUpTimerDateBeforeBuildingThisAction")
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
      pushFieldError(mintErrors, FIELD_ERROR_IDS.walletName, i18n("nameThisWalletBeforeCreatingIt"));
    } else if (walletNameByteLength(mintWalletName) > MAX_WALLET_NAME_BYTES) {
      pushFieldError(
        mintErrors,
        FIELD_ERROR_IDS.walletName,
        i18n("useANameThatFitsInMaxWallet", { MAX_WALLET_NAME_BYTES: MAX_WALLET_NAME_BYTES })
      );
    } else if (walletNameAlreadyExists(mintWalletName, existingWalletNames)) {
      pushFieldError(
        mintErrors,
        FIELD_ERROR_IDS.walletName,
        i18n("youAlreadyHaveAWalletWithThisName")
      );
    }
    try {
      const mintDatum = stateFormToDatum(
        cloneStateForm(mintStateForm),
        MINT_PERFORMED_ACTION
      );
      appendValidationErrors(mintErrors, FIELD_ERROR_IDS.walletRules, validateMintStateDatum(mintDatum));
    } catch (error) {
      pushFieldError(
        mintErrors,
        FIELD_ERROR_IDS.walletRules,
        getUserFacingErrorMessage(error, i18n("checkTheWalletRulesAndTryAgain"))
      );
    }
    if (mintStarterAssets.length === 0) {
      pushFieldError(mintErrors, FIELD_ERROR_IDS.starterFunds, i18n("addAdaOrOneAssetForTheNew"));
    }
    validateAssetRows(mintErrors, FIELD_ERROR_IDS.starterFunds, mintStarterAssets);
    if (!hasPositiveAssetAmount(mintStarterAssets)) {
      pushFieldError(
        mintErrors,
        FIELD_ERROR_IDS.starterFunds,
        i18n("addAtLeastOneAmountGreaterThanZero")
      );
    }
    if (countAdminUsersInStateForm(mintStateForm) === 0 && !mintZeroAdminConfirmed) {
      pushFieldError(
        mintErrors,
        FIELD_ERROR_IDS.noDirectOwner,
        i18n("confirmThatThisWalletHasNoDirectOwner")
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
      FIELD_ERROR_IDS.walletIdentityTransactionHash,
      REQUIRED_TEXT_SCHEMA,
      consolidateSttInputHash
    );
    validateField(
      consolidateErrors,
      FIELD_ERROR_IDS.walletIdentityOutputIndex,
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      consolidateSttInputIndex
    );
    validateWalletInputRefs(
      consolidateErrors,
      FIELD_ERROR_IDS.selectedFundPools,
      consolidateWalletInputs,
      1
    );
    validateWalletScriptOutputs(
      consolidateErrors,
      FIELD_ERROR_IDS.resultingFundPools,
      consolidateWalletOutputs
    );
    validateAssetRows(consolidateErrors, FIELD_ERROR_IDS.walletSettings, consolidateSttAssets);
    try {
      stateFormToDatum(
        cloneStateForm(activeInferredSttStateForm),
        consolidateActionAlternative
      );
      serializeWalletOutputs(consolidateWalletOutputs);
    } catch (error) {
      pushFieldError(
        consolidateErrors,
        FIELD_ERROR_IDS.consolidation,
        getUserFacingErrorMessage(error, i18n("checkTheSelectedFundPoolsAndTryAgain"))
      );
    }

    const lockFundsErrors: FieldErrors = {};
    if (lockFundsAssets.length === 0) {
      pushFieldError(lockFundsErrors, FIELD_ERROR_IDS.assetsToLock, i18n("addAtLeastOneAssetRow"));
    }
    validateAssetRows(lockFundsErrors, FIELD_ERROR_IDS.assetsToLock, lockFundsAssets);

    const walletSpendErrors: FieldErrors = {};
    validateField(
      walletSpendErrors,
      FIELD_ERROR_IDS.walletInputTransactionHash,
      REQUIRED_TEXT_SCHEMA,
      walletSpendInputHash
    );
    validateField(
      walletSpendErrors,
      FIELD_ERROR_IDS.walletInputIndex,
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      walletSpendInputIndex
    );
    if (walletSpendOutputs.length === 0) {
      pushFieldError(walletSpendErrors, FIELD_ERROR_IDS.outputs, i18n("addAtLeastOneDestination"));
    }
    validateTransferRows(walletSpendErrors, FIELD_ERROR_IDS.outputs, walletSpendOutputs);
    try {
      serializeRequiredConstrPreset(walletSpendRedeemerPreset, "Wallet spend redeemer");
      serializeTransfers(walletSpendOutputs);
    } catch (error) {
      pushFieldError(
        walletSpendErrors,
        FIELD_ERROR_IDS.walletSpend,
        getUserFacingErrorMessage(error, i18n("checkTheRecipientsAndAmountsThenTryAgain"))
      );
    }

    const withdrawErrors: FieldErrors = {};
    validateField(
      withdrawErrors,
      FIELD_ERROR_IDS.stakingAddress,
      REQUIRED_TEXT_SCHEMA,
      withdrawRewardAddress
    );
    validateField(
      withdrawErrors,
      FIELD_ERROR_IDS.withdrawalAmount,
      NON_NEGATIVE_INTEGER_SCHEMA,
      withdrawAmount
    );
    const withdrawSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      withdrawSttInputHash,
      withdrawSttInputIndex
    );
    validateField(withdrawErrors, FIELD_ERROR_IDS.walletIdentityTransactionHash, REQUIRED_TEXT_SCHEMA, withdrawSttRef.txHash);
    validateField(
      withdrawErrors,
      FIELD_ERROR_IDS.walletIdentityOutputIndex,
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      withdrawSttRef.indexStr
    );
    validateAssetRows(withdrawErrors, FIELD_ERROR_IDS.walletSettings, withdrawSttAssets);
    try {
      const withdrawStateDatum = stateFormToDatum(
        cloneStateForm(withdrawSttStateForm),
        operatorActionAlternative
      );
      appendValidationErrors(
        withdrawErrors,
        FIELD_ERROR_IDS.walletSettings,
        validateStateDatum(withdrawStateDatum, {
          expectedPerformedAction: operatorActionAlternative
        })
      );
    } catch (error) {
      pushFieldError(
        withdrawErrors,
        FIELD_ERROR_IDS.walletSettings,
        getUserFacingErrorMessage(error, i18n("checkTheWalletSettingsAndTryAgain"))
      );
    }
    if (countAdminUsersInStateForm(withdrawSttStateForm) === 0 && !withdrawZeroAdminConfirmed) {
      pushFieldError(
        withdrawErrors,
        FIELD_ERROR_IDS.noDirectOwner,
        i18n("confirmThatThisWalletHasNoDirectOwner_e7e563")
      );
    }

    const publishErrors: FieldErrors = {};
    validateField(
      publishErrors,
      FIELD_ERROR_IDS.certificateJson,
      REQUIRED_TEXT_SCHEMA,
      publishCertificateJson
    );
    const publishSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      publishSttInputHash,
      publishSttInputIndex
    );
    validateField(publishErrors, FIELD_ERROR_IDS.walletIdentityTransactionHash, REQUIRED_TEXT_SCHEMA, publishSttRef.txHash);
    validateField(
      publishErrors,
      FIELD_ERROR_IDS.walletIdentityOutputIndex,
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      publishSttRef.indexStr
    );
    const publishGovernanceStateForm = selectedDetectedTokenStateForm
      ? cloneStateForm(selectedDetectedTokenStateForm)
      : cloneStateForm(publishSttStateForm);
    validateAssetRows(publishErrors, FIELD_ERROR_IDS.walletSettings, publishSttAssets);
    try {
      JSON.parse(publishCertificateJson);
      const publishStateDatum = stateFormToDatum(
        cloneStateForm(publishGovernanceStateForm),
        operatorActionAlternative
      );
      appendValidationErrors(
        publishErrors,
        FIELD_ERROR_IDS.walletSettings,
        validateStateDatum(publishStateDatum, {
          expectedPerformedAction: operatorActionAlternative
        })
      );
    } catch (error) {
      pushFieldError(
        publishErrors,
        FIELD_ERROR_IDS.publish,
        getUserFacingErrorMessage(error, i18n("checkTheGovernanceCertificateAndTryAgain"))
      );
    }
    if (
      !selectedDetectedToken &&
      countAdminUsersInStateForm(publishGovernanceStateForm) === 0 &&
      !publishZeroAdminConfirmed
    ) {
      pushFieldError(
        publishErrors,
        FIELD_ERROR_IDS.noDirectOwner,
        i18n("confirmThatThisWalletHasNoDirectOwner_29a7d4")
      );
    }

    const voteErrors: FieldErrors = {};
    validateField(
      voteErrors,
      FIELD_ERROR_IDS.voteJson,
      REQUIRED_TEXT_SCHEMA,
      voteJson
    );
    const voteSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      voteSttInputHash,
      voteSttInputIndex
    );
    validateField(voteErrors, FIELD_ERROR_IDS.walletIdentityTransactionHash, REQUIRED_TEXT_SCHEMA, voteSttRef.txHash);
    validateField(
      voteErrors,
      FIELD_ERROR_IDS.walletIdentityOutputIndex,
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      voteSttRef.indexStr
    );
    const voteGovernanceStateForm = selectedDetectedTokenStateForm
      ? cloneStateForm(selectedDetectedTokenStateForm)
      : cloneStateForm(voteSttStateForm);
    validateAssetRows(voteErrors, FIELD_ERROR_IDS.walletSettings, voteSttAssets);
    try {
      JSON.parse(voteJson);
      const voteStateDatum = stateFormToDatum(
        cloneStateForm(voteGovernanceStateForm),
        operatorActionAlternative
      );
      appendValidationErrors(
        voteErrors,
        FIELD_ERROR_IDS.walletSettings,
        validateStateDatum(voteStateDatum, {
          expectedPerformedAction: operatorActionAlternative
        })
      );
    } catch (error) {
      pushFieldError(
        voteErrors,
        FIELD_ERROR_IDS.vote,
        getUserFacingErrorMessage(error, i18n("checkTheGovernanceVoteAndTryAgain"))
      );
    }
    if (
      !selectedDetectedToken &&
      countAdminUsersInStateForm(voteGovernanceStateForm) === 0 &&
      !voteZeroAdminConfirmed
    ) {
      pushFieldError(
        voteErrors,
        FIELD_ERROR_IDS.noDirectOwner,
        i18n("confirmThatThisWalletHasNoDirectOwner_f01bbc")
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
      "wallet-vote": voteErrors,
      // Enable-staking takes no free-form fields — it sets the wallet's own
      // staking script as the stake credential, so there is nothing to validate.
      "set-intended-stake-credential": {}
    };
}
