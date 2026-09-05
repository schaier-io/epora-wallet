// Pure per-action field validation extracted from permission-wallet-workspace.tsx.
import { type FieldErrors, type UserActionKind } from "@/components/user/flow-types";
import { MINT_PERFORMED_ACTION, NON_NEGATIVE_INTEGER_SCHEMA, OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA, RENEW_PROOF_OF_LIFE_ACTION, REQUIRED_TEXT_SCHEMA } from "@/components/user/workspace/constants";
import { appendValidationErrors, cloneStateForm, hasPositiveAssetAmount, pushFieldError, resolveConsolidateActionAlternative, resolveManageStreamingPaymentsActionAlternative, resolveOperatorActionAlternative, resolveUpdateStateActionAlternative, resolveUseActionAlternative, resolveProofOfLifeOverrideTimestamp, resolveWalletWrapperSttInputRef, serializeWalletOutputs, validateAssetRows, validateField, validateWalletInputRefs, validateWalletScriptOutputs, walletNameAlreadyExists } from "@/components/user/workspace/helpers";
import { type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { type ProofOfLifeOverrideMode, type StateFormState, applyProofOfLifeOverrideToStateForm, countAdminUsersInStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import { validateMintStateDatum, validateStateDatum } from "@/lib/contracts/state-validation";
import { MAX_WALLET_NAME_BYTES, normalizeWalletName, walletNameByteLength } from "@/lib/contracts/state-wallet-name";
import { MAX_WALLET_INPUTS_PER_CONSOLIDATION } from "@/lib/contracts/transaction-limits";
import {
  requireStakingEnabled,
  requireZeroAdminConfirmation,
  validateGovernanceVotePayload
} from "@/components/user/workspace/action-validation-shared";
import { type DetectedSttToken } from "@/lib/mesh/detection";
import { getValidityWindow } from "@/lib/mesh/transactions";
import { type Asset, type AuthorityPath, type ConsolidateAuthorityPath, type OperatorAuthorityPath, type PayoutTransfer, type WalletInputRef } from "@/lib/types/contracts";
import { computeSpendActionErrors } from "@/components/user/workspace/action-validation-spend";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceActionValidation.json";

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
        i18n("chooseAProofOfLifeDateBeforeYou")
      );

      return applyProofOfLifeOverrideToStateForm(
        cloneStateForm(activeInferredSttStateForm),
        sttProofOfLifeOverrideMode,
        specificTimestamp,
        getValidityWindow(Date.now())
      );
    }

    const walletNameChanged =
      normalizeWalletName(sttStateForm.walletName) !==
      normalizeWalletName(activeInferredSttStateForm.walletName);

    const mintErrors: FieldErrors = {};
    const mintWalletName = mintStateForm.walletName.trim();
    if (!mintWalletName) {
      pushFieldError(mintErrors, i18n("walletName"), i18n("nameThisWalletBeforeCreatingIt"));
    } else if (walletNameByteLength(mintWalletName) > MAX_WALLET_NAME_BYTES) {
      pushFieldError(
        mintErrors,
        i18n("walletName"),
        i18n("useANameThatFitsInMaxWallet", { limit: MAX_WALLET_NAME_BYTES })
      );
    } else if (walletNameAlreadyExists(mintWalletName, existingWalletNames)) {
      pushFieldError(
        mintErrors,
        i18n("walletName"),
        i18n("youAlreadyHaveAWalletWithThisName")
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
        i18n("walletRules"),
        error instanceof Error ? error.message : i18n("walletRulesAreInvalid")
      );
    }
    if (mintStarterAssets.length === 0) {
      pushFieldError(mintErrors, i18n("starterFunds"), i18n("addAdaOrOneAssetForTheNew"));
    }
    validateAssetRows(mintErrors, "Starter funds", mintStarterAssets);
    if (!hasPositiveAssetAmount(mintStarterAssets)) {
      pushFieldError(
        mintErrors,
        i18n("starterFunds"),
        i18n("addAtLeastOneAmountGreaterThanZero")
      );
    }
    requireZeroAdminConfirmation(mintErrors, mintStateForm, mintZeroAdminConfirmed);

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
      "Fund pools",
      consolidateWalletInputs,
      1,
      MAX_WALLET_INPUTS_PER_CONSOLIDATION
    );
    validateWalletScriptOutputs(
      consolidateErrors,
      "New fund pools",
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
        i18n("consolidation"),
        error instanceof Error ? error.message : i18n("consolidationInputsAreInvalid")
      );
    }

    const lockFundsErrors: FieldErrors = {};
    if (lockFundsAssets.length === 0) {
      pushFieldError(lockFundsErrors, i18n("assetsToLock"), i18n("addAtLeastOneAssetRow"));
    }
    validateAssetRows(lockFundsErrors, "Assets to lock", lockFundsAssets);

    const withdrawErrors: FieldErrors = {};
    requireStakingEnabled(withdrawErrors, activeInferredSttStateForm);
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
        i18n("forwardedSttState"),
        error instanceof Error ? error.message : i18n("walletStateIsInvalid")
      );
    }
    requireZeroAdminConfirmation(withdrawErrors, withdrawSttStateForm, withdrawZeroAdminConfirmed);

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
      // `{}` parses, so the old check passed it straight through to a wallet signature on a
      // certificate with no content. A certificate is identified by its `type`, and nothing
      // downstream can do anything useful without one.
      const parsedCertificate: unknown = JSON.parse(publishCertificateJson);
      if (
        typeof parsedCertificate !== "object" ||
        parsedCertificate === null ||
        Array.isArray(parsedCertificate) ||
        typeof (parsedCertificate as { type?: unknown }).type !== "string" ||
        (parsedCertificate as { type: string }).type.trim().length === 0
      ) {
        pushFieldError(
          publishErrors,
          i18n("certificateJson"),
          i18n("thisCertificateHasNoTypeSoThereIs")
        );
      }
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
        i18n("publish"),
        error instanceof Error ? error.message : i18n("publishInputsAreInvalid")
      );
    }
    if (
      !selectedDetectedToken &&
      countAdminUsersInStateForm(publishGovernanceStateForm) === 0 &&
      !publishZeroAdminConfirmed
    ) {
      pushFieldError(
        publishErrors,
        i18n("walletWithNoOwner"),
        i18n("confirmThatThisWalletWillHaveNoOwner")
      );
    }

    const voteErrors: FieldErrors = {};
    validateField(
      voteErrors,
      "Vote JSON",
      REQUIRED_TEXT_SCHEMA,
      voteJson
    );
    const voteSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      voteSttInputHash,
      voteSttInputIndex
    );
    validateField(voteErrors, "STT input tx hash", REQUIRED_TEXT_SCHEMA, voteSttRef.txHash);
    validateField(
      voteErrors,
      "STT input index",
      OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA,
      voteSttRef.indexStr
    );
    const voteGovernanceStateForm = selectedDetectedTokenStateForm
      ? cloneStateForm(selectedDetectedTokenStateForm)
      : cloneStateForm(voteSttStateForm);
    validateAssetRows(voteErrors, "Forwarded STT assets", voteSttAssets);
    validateGovernanceVotePayload(voteErrors, voteJson);
    try {
      JSON.parse(voteJson);
      const voteStateDatum = stateFormToDatum(
        cloneStateForm(voteGovernanceStateForm),
        operatorActionAlternative
      );
      appendValidationErrors(
        voteErrors,
        "Forwarded STT state",
        validateStateDatum(voteStateDatum, {
          expectedPerformedAction: operatorActionAlternative
        })
      );
    } catch (error) {
      pushFieldError(
        voteErrors,
        i18n("vote"),
        error instanceof Error ? error.message : i18n("voteInputsAreInvalid")
      );
    }
    if (
      !selectedDetectedToken &&
      countAdminUsersInStateForm(voteGovernanceStateForm) === 0 &&
      !voteZeroAdminConfirmed
    ) {
      pushFieldError(
        voteErrors,
        i18n("walletWithNoOwner"),
        i18n("confirmThatThisWalletWillHaveNoOwner")
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
      "wallet-withdraw": withdrawErrors,
      "wallet-publish": publishErrors,
      "wallet-vote": voteErrors,
      // Enable-staking takes no free-form fields. It sets the wallet's own
      // staking script as the stake credential, so there is nothing to validate.
      "set-intended-stake-credential": {}
    };
}
