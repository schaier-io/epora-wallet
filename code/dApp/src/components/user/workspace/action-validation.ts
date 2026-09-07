// Pure per-action field validation extracted from permission-wallet-workspace.tsx.
import type { UTxO } from "@meshsdk/core";
import { deriveBeneficiaryDistributionPreview } from "./beneficiary-distribution-model";
import { deriveBeneficiaryStreamStopPreview } from "./beneficiary-stream-stop-model";
import { type FieldErrors, type UserActionKind } from "@/components/user/flow-types";
import { MINT_PERFORMED_ACTION, NON_NEGATIVE_INTEGER_SCHEMA, OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA, RENEW_PROOF_OF_LIFE_ACTION, REQUIRED_TEXT_SCHEMA } from "@/components/user/workspace/constants";
import { appendValidationErrors, cloneStateForm, hasPositiveAssetAmount, pushFieldError, resolveConsolidateActionAlternative, resolveManageStreamingPaymentsActionAlternative, resolveOperatorActionAlternative, resolveUpdateStateActionAlternative, resolveUseActionAlternative, resolveProofOfLifeOverrideTimestamp, resolveWalletWrapperSttInputRef, serializeWalletOutputs, validateAssetRows, validateField, validateWalletInputRefs, validateWalletScriptOutputs, walletNameAlreadyExists } from "@/components/user/workspace/helpers";
import { type TransferFormState, type WalletBalanceSummary, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { validateStreamingAssetProofDraft } from "./streaming-asset-proof-validation";
import { type ProofOfLifeOverrideMode, type StateFormState, applyProofOfLifeOverrideToStateForm, countAdminUsersInStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import { validateStateDatum } from "@/lib/contracts/state-validation";
import { validateMintStateDatum } from "@/lib/contracts/state-validation-streaming";
import { getSttMintPolicyId } from "@/lib/contracts/blueprint";
import { MAX_WALLET_NAME_BYTES, normalizeWalletName, walletNameByteLength } from "@/lib/contracts/state-wallet-name";
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
  beneficiaryStreamStopId?: string;
  beneficiaryPreparation?: { error: string | null; ready: boolean };
  nowMs?: number;
  lockedContractUtxos?: UTxO[];
  lockedContractUtxosLoading?: boolean;
  lockedContractUtxosError?: string | null;
  walletBalanceSummary?: WalletBalanceSummary;
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
      appendValidationErrors(
        mintErrors,
        i18n("walletRules"),
        validateMintStateDatum(mintDatum, undefined, getSttMintPolicyId())
      );
      appendValidationErrors(mintErrors, i18n("walletRules"), validateStreamingAssetProofDraft(
        mintDatum,
        input.walletBalanceSummary ? [input.walletBalanceSummary] : []
      ));
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
    validateAssetRows(mintErrors, i18n("starterFunds"), mintStarterAssets);
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
      i18n("fundPools"),
      consolidateWalletInputs,
      1
    );
    if (input.beneficiaryPreparation) {
      if (input.beneficiaryPreparation.error || !input.beneficiaryPreparation.ready) {
        pushFieldError(consolidateErrors, i18n("preparation"), input.beneficiaryPreparation.error ?? i18n("preparationRequirements"));
      }
    } else {
    validateWalletScriptOutputs(
      consolidateErrors,
      i18n("newFundPools"),
      consolidateWalletOutputs
    );
    validateAssetRows(consolidateErrors, i18n("forwardedSttAssets"), consolidateSttAssets);
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
    }

    const lockFundsErrors: FieldErrors = {};
    if (lockFundsAssets.length === 0) {
      pushFieldError(lockFundsErrors, i18n("assetsToLock"), i18n("addAtLeastOneAssetRow"));
    } else if (!hasPositiveAssetAmount(lockFundsAssets)) {
      pushFieldError(
        lockFundsErrors,
        i18n("assetsToLock"),
        i18n("addAtLeastOneAmountGreaterThanZero")
      );
    }
    validateAssetRows(lockFundsErrors, i18n("assetsToLock"), lockFundsAssets);

    const withdrawErrors: FieldErrors = {};
    requireStakingEnabled(withdrawErrors, activeInferredSttStateForm);
    validateField(
      withdrawErrors,
      i18n("stakingAddress"),
      REQUIRED_TEXT_SCHEMA,
      withdrawRewardAddress
    );
    validateField(
      withdrawErrors,
      i18n("withdrawalAmount"),
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
    validateAssetRows(withdrawErrors, i18n("forwardedSttAssets"), withdrawSttAssets);
    try {
      const withdrawStateDatum = stateFormToDatum(
        cloneStateForm(withdrawSttStateForm),
        operatorActionAlternative
      );
      appendValidationErrors(
        withdrawErrors,
        i18n("forwardedSttState"),
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
      i18n("certificateJson"),
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
    validateAssetRows(publishErrors, i18n("forwardedSttAssets"), publishSttAssets);
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
        i18n("forwardedSttState"),
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
      i18n("voteJson"),
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
    validateAssetRows(voteErrors, i18n("forwardedSttAssets"), voteSttAssets);
    validateGovernanceVotePayload(voteErrors, voteJson);
    try {
      JSON.parse(voteJson);
      const voteStateDatum = stateFormToDatum(
        cloneStateForm(voteGovernanceStateForm),
        operatorActionAlternative
      );
      appendValidationErrors(
        voteErrors,
        i18n("forwardedSttState"),
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

    const distributionErrors: FieldErrors = {};
    const distributionPreview = deriveBeneficiaryDistributionPreview({
      form: activeInferredSttStateForm, signer: activePaymentKeyHash,
      selectedRefs: input.sttWalletInputs, utxos: input.lockedContractUtxos ?? [],
      loading: input.lockedContractUtxosLoading, discoveryError: input.lockedContractUtxosError,
      nowMs: input.nowMs ?? Date.now(),
      sttInput: { txHash: input.sttInputTxHash, outputIndex: Number(input.sttInputOutputIndex) }
    });
    if (distributionPreview.error) pushFieldError(distributionErrors, i18n("distribution"), distributionPreview.error);
    validateField(distributionErrors, "STT input tx hash", REQUIRED_TEXT_SCHEMA, input.sttInputTxHash);
    validateField(distributionErrors, "STT input index", OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA, input.sttInputOutputIndex);
    const stopErrors: FieldErrors = {};
    const stopPreview = deriveBeneficiaryStreamStopPreview(activeInferredSttStateForm, activePaymentKeyHash, input.beneficiaryStreamStopId ?? "", input.nowMs ?? Date.now());
    if (stopPreview.error) pushFieldError(stopErrors, i18n("scheduledPayment"), stopPreview.error);
    validateField(stopErrors, "STT input tx hash", REQUIRED_TEXT_SCHEMA, input.sttInputTxHash);
    validateField(stopErrors, "STT input index", OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA, input.sttInputOutputIndex);
    return {
      "distribute-beneficiaries": distributionErrors,
      "stop-beneficiary-stream": stopErrors,
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
