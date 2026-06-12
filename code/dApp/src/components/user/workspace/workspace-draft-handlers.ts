"use client";
import { useSetAtom } from "jotai";
import { consolidateStateFormAtom, consolidateSttAssetsAtom, consolidateSttInputHashAtom, consolidateSttInputIndexAtom, consolidateWalletInputsAtom, consolidateWalletOutputsAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import { lockFundsAssetsAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";
import { mintReferenceAtom, mintStarterAssetsAtom, mintStateFormAtom, mintZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { proposalJsonAtom, proposalSttAssetsAtom, proposalSttInputHashAtom, proposalSttInputIndexAtom, proposalSttStateFormAtom, proposalZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/propose-form.atoms";
import { publishCertificateJsonAtom, publishSttAssetsAtom, publishSttInputHashAtom, publishSttInputIndexAtom, publishSttStateFormAtom, publishZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import { consolidateAuthorityPathAtom, streamingPaymentPayoutAmountsAtom, sttAuthorityPathAtom, sttExtraTransfersAtom, sttInputOutputIndexAtom, sttInputTxHashAtom, sttOutputAssetsAtom, sttProofOfLifeOverrideModeAtom, sttProofOfLifeSpecificDateTimeAtom, sttStateFormAtom, sttTransferAddressAtom, sttTransferAmountsAtom, sttWalletInputsAtom, sttWalletOutputsAtom, sttZeroAdminConfirmedAtom, walletOperatorPathAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { transferCustomAddressAtom, transferDisplayAmountAtom, transferRecipientModeAtom, transferSelectedUnitAtom } from "@/components/user/workspace/atoms/forms/transfer-form.atoms";
import { walletSpendInputHashAtom, walletSpendInputIndexAtom, walletSpendOutputsAtom, walletSpendRedeemerPresetAtom } from "@/components/user/workspace/atoms/forms/wallet-spend-form.atoms";
import { withdrawAmountAtom, withdrawRewardAddressAtom, withdrawSttAssetsAtom, withdrawSttInputHashAtom, withdrawSttInputIndexAtom, withdrawSttStateFormAtom, withdrawZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";
import { type MutableRefObject } from "react";
import { type WalletInputRef } from "@/lib/types/contracts";

import type {
  UserActionKind
} from "@/components/user/flow-types";

import {
  createDefaultStateForm,
  stateFormFromDatum
} from "@/lib/contracts/state-form";

import { type useWalletContext } from "@/providers/wallet-provider";
import { type useWorkspaceDetectedTokenDerivations } from "@/components/user/workspace/use-workspace-detected-token-derivations";

import { DEFAULT_LOCK_ASSETS, DEFAULT_MINT_STARTER_ASSETS, DEFAULT_REQUIRED_CONSTR_PRESET } from "@/components/user/workspace/constants";
import { cloneAssets, cloneStateForm } from "@/components/user/workspace/helpers";

/**
 * The form-draft lifecycle handlers, extracted from the controller hook.
 * `resetActionDraft` restores an action's form to its defaults; `clearActionDraft`
 * blanks it. Both drive the nine per-action form setters, so the ctx spreads the
 * form-hook return shapes plus a handful of controller-derived values.
 */
import { type StateFormState } from "@/lib/contracts/state-form";

export type WorkspaceDraftHandlersCtx = {
  activeAddress: ReturnType<typeof useWalletContext>["activeAddress"];
  autoMintStateForm: StateFormState;
  clearBuildMessages: () => void;
  clearPreviewResult: () => void;
  selectedDetectedToken: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedDetectedToken"];
  pendingOrphanWalletInputsRef: MutableRefObject<WalletInputRef[] | null>;
  };

export function useWorkspaceDraftHandlers(ctx: WorkspaceDraftHandlersCtx) {
  const {
    activeAddress,
    autoMintStateForm,
    clearBuildMessages,
    clearPreviewResult,
    selectedDetectedToken,
    pendingOrphanWalletInputsRef
  } = ctx;
  const setConsolidateAuthorityPath = useSetAtom(consolidateAuthorityPathAtom);
  const setConsolidateStateForm = useSetAtom(consolidateStateFormAtom);
  const setConsolidateSttAssets = useSetAtom(consolidateSttAssetsAtom);
  const setConsolidateSttInputHash = useSetAtom(consolidateSttInputHashAtom);
  const setConsolidateSttInputIndex = useSetAtom(consolidateSttInputIndexAtom);
  const setConsolidateWalletInputs = useSetAtom(consolidateWalletInputsAtom);
  const setConsolidateWalletOutputs = useSetAtom(consolidateWalletOutputsAtom);
  const setLockFundsAssets = useSetAtom(lockFundsAssetsAtom);
  const setMintReference = useSetAtom(mintReferenceAtom);
  const setMintStarterAssets = useSetAtom(mintStarterAssetsAtom);
  const setMintStateForm = useSetAtom(mintStateFormAtom);
  const setMintZeroAdminConfirmed = useSetAtom(mintZeroAdminConfirmedAtom);
  const setProposalJson = useSetAtom(proposalJsonAtom);
  const setProposalSttAssets = useSetAtom(proposalSttAssetsAtom);
  const setProposalSttInputHash = useSetAtom(proposalSttInputHashAtom);
  const setProposalSttInputIndex = useSetAtom(proposalSttInputIndexAtom);
  const setProposalSttStateForm = useSetAtom(proposalSttStateFormAtom);
  const setProposalZeroAdminConfirmed = useSetAtom(proposalZeroAdminConfirmedAtom);
  const setPublishCertificateJson = useSetAtom(publishCertificateJsonAtom);
  const setPublishSttAssets = useSetAtom(publishSttAssetsAtom);
  const setPublishSttInputHash = useSetAtom(publishSttInputHashAtom);
  const setPublishSttInputIndex = useSetAtom(publishSttInputIndexAtom);
  const setPublishSttStateForm = useSetAtom(publishSttStateFormAtom);
  const setPublishZeroAdminConfirmed = useSetAtom(publishZeroAdminConfirmedAtom);
  const setStreamingPaymentPayoutAmounts = useSetAtom(streamingPaymentPayoutAmountsAtom);
  const setSttAuthorityPath = useSetAtom(sttAuthorityPathAtom);
  const setSttExtraTransfers = useSetAtom(sttExtraTransfersAtom);
  const setSttInputOutputIndex = useSetAtom(sttInputOutputIndexAtom);
  const setSttInputTxHash = useSetAtom(sttInputTxHashAtom);
  const setSttOutputAssets = useSetAtom(sttOutputAssetsAtom);
  const setSttProofOfLifeOverrideMode = useSetAtom(sttProofOfLifeOverrideModeAtom);
  const setSttProofOfLifeSpecificDateTime = useSetAtom(sttProofOfLifeSpecificDateTimeAtom);
  const setSttStateForm = useSetAtom(sttStateFormAtom);
  const setSttTransferAddress = useSetAtom(sttTransferAddressAtom);
  const setSttTransferAmounts = useSetAtom(sttTransferAmountsAtom);
  const setSttWalletInputs = useSetAtom(sttWalletInputsAtom);
  const setSttWalletOutputs = useSetAtom(sttWalletOutputsAtom);
  const setSttZeroAdminConfirmed = useSetAtom(sttZeroAdminConfirmedAtom);
  const setTransferCustomAddress = useSetAtom(transferCustomAddressAtom);
  const setTransferDisplayAmount = useSetAtom(transferDisplayAmountAtom);
  const setTransferRecipientMode = useSetAtom(transferRecipientModeAtom);
  const setTransferSelectedUnit = useSetAtom(transferSelectedUnitAtom);
  const setWalletOperatorPath = useSetAtom(walletOperatorPathAtom);
  const setWalletSpendInputHash = useSetAtom(walletSpendInputHashAtom);
  const setWalletSpendInputIndex = useSetAtom(walletSpendInputIndexAtom);
  const setWalletSpendOutputs = useSetAtom(walletSpendOutputsAtom);
  const setWalletSpendRedeemerPreset = useSetAtom(walletSpendRedeemerPresetAtom);
  const setWithdrawAmount = useSetAtom(withdrawAmountAtom);
  const setWithdrawRewardAddress = useSetAtom(withdrawRewardAddressAtom);
  const setWithdrawSttAssets = useSetAtom(withdrawSttAssetsAtom);
  const setWithdrawSttInputHash = useSetAtom(withdrawSttInputHashAtom);
  const setWithdrawSttInputIndex = useSetAtom(withdrawSttInputIndexAtom);
  const setWithdrawSttStateForm = useSetAtom(withdrawSttStateFormAtom);
  const setWithdrawZeroAdminConfirmed = useSetAtom(withdrawZeroAdminConfirmedAtom);

  function resetActionDraft(action: UserActionKind) {
    if (action === "mint") {
      setMintReference("");
      setMintStarterAssets(cloneAssets(DEFAULT_MINT_STARTER_ASSETS));
      setMintStateForm(cloneStateForm(autoMintStateForm));
      setMintZeroAdminConfirmed(false);
      clearPreviewResult();
      clearBuildMessages();
      return;
    }

    if (
      action === "use" ||
      action === "update-state" ||
      action === "manage-streaming-payments" ||
      action === "use-allowance" ||
      action === "use-beneficiary" ||
      action === "payout-streaming-payment"
    ) {
      const nextState = selectedDetectedToken
        ? stateFormFromDatum(selectedDetectedToken.datum)
        : createDefaultStateForm();

      setSttInputTxHash(selectedDetectedToken?.utxo.input.txHash ?? "");
      setSttInputOutputIndex(
        selectedDetectedToken ? selectedDetectedToken.utxo.input.outputIndex.toString() : ""
      );
      setSttStateForm(cloneStateForm(nextState));
      setSttOutputAssets([]);
      setSttWalletInputs([]);
      setSttWalletOutputs([]);
      setSttExtraTransfers([]);
      setSttZeroAdminConfirmed(false);
      setSttProofOfLifeOverrideMode("auto");
      setSttProofOfLifeSpecificDateTime("");
      setSttTransferAddress("");
      setSttTransferAmounts({});
      setTransferRecipientMode(activeAddress ? "my-address" : "custom");
      setTransferCustomAddress("");
      setTransferSelectedUnit("lovelace");
      setTransferDisplayAmount("");
      setStreamingPaymentPayoutAmounts({});
      setSttAuthorityPath("admin");
      clearPreviewResult();
      clearBuildMessages();
      return;
    }

    if (action === "consolidate-utxo") {
      const nextState = selectedDetectedToken
        ? stateFormFromDatum(selectedDetectedToken.datum)
        : createDefaultStateForm();

      setConsolidateSttInputHash(selectedDetectedToken?.utxo.input.txHash ?? "");
      setConsolidateSttInputIndex(
        selectedDetectedToken ? selectedDetectedToken.utxo.input.outputIndex.toString() : ""
      );
      setConsolidateStateForm(cloneStateForm(nextState));
      setConsolidateSttAssets([]);
      // Seed wallet inputs from a pending orphan-consolidation request (the
      // "move to my wallet address" action); otherwise start empty.
      setConsolidateWalletInputs(pendingOrphanWalletInputsRef.current ?? []);
      pendingOrphanWalletInputsRef.current = null;
      setConsolidateWalletOutputs([]);
      setConsolidateAuthorityPath("admin");
      clearPreviewResult();
      clearBuildMessages();
      return;
    }

    if (action === "lock-funds") {
      setLockFundsAssets(cloneAssets(DEFAULT_LOCK_ASSETS));
      clearPreviewResult();
      clearBuildMessages();
      return;
    }

    if (action === "wallet-spend") {
      setWalletSpendInputHash("");
      setWalletSpendInputIndex("");
      setWalletSpendRedeemerPreset({ ...DEFAULT_REQUIRED_CONSTR_PRESET });
      setWalletSpendOutputs([]);
      clearPreviewResult();
      clearBuildMessages();
      return;
    }

    if (action === "wallet-publish") {
      setPublishCertificateJson("{}");
      setPublishSttInputHash("");
      setPublishSttInputIndex("");
      setPublishSttStateForm(
        selectedDetectedToken
          ? cloneStateForm(stateFormFromDatum(selectedDetectedToken.datum))
          : createDefaultStateForm()
      );
      setPublishSttAssets([]);
      setPublishZeroAdminConfirmed(false);
      setWalletOperatorPath("admin");
      clearPreviewResult();
      clearBuildMessages();
      return;
    }

    if (action === "wallet-propose") {
      setProposalJson("{}");
      setProposalSttInputHash("");
      setProposalSttInputIndex("");
      setProposalSttStateForm(
        selectedDetectedToken
          ? cloneStateForm(stateFormFromDatum(selectedDetectedToken.datum))
          : createDefaultStateForm()
      );
      setProposalSttAssets([]);
      setProposalZeroAdminConfirmed(false);
      setWalletOperatorPath("admin");
      clearPreviewResult();
      clearBuildMessages();
      return;
    }

    setWithdrawRewardAddress("");
    setWithdrawAmount("1000000");
    setWithdrawSttInputHash(selectedDetectedToken?.utxo.input.txHash ?? "");
    setWithdrawSttInputIndex(
      selectedDetectedToken ? selectedDetectedToken.utxo.input.outputIndex.toString() : ""
    );
    setWithdrawSttStateForm(
      cloneStateForm(
        selectedDetectedToken ? stateFormFromDatum(selectedDetectedToken.datum) : createDefaultStateForm()
      )
    );
    setWithdrawZeroAdminConfirmed(false);
    setWithdrawSttAssets([]);
    setWalletOperatorPath("admin");
    clearPreviewResult();
    clearBuildMessages();
  }

  function clearActionDraft(action: UserActionKind) {
    if (action === "mint") {
      setMintReference("");
      setMintStarterAssets(cloneAssets(DEFAULT_MINT_STARTER_ASSETS));
      setMintStateForm(createDefaultStateForm());
      setMintZeroAdminConfirmed(false);
      clearPreviewResult();
      clearBuildMessages();
      return;
    }

    if (
      action === "use" ||
      action === "update-state" ||
      action === "manage-streaming-payments" ||
      action === "use-allowance" ||
      action === "use-beneficiary" ||
      action === "payout-streaming-payment"
    ) {
      /* Same as reload defaults: keep STT input + datum-derived state tied to the opened smart wallet. */
      resetActionDraft(action);
      return;
    }

    if (action === "consolidate-utxo") {
      resetActionDraft(action);
      return;
    }

    if (action === "lock-funds") {
      setLockFundsAssets([]);
      clearPreviewResult();
      clearBuildMessages();
      return;
    }

    if (action === "wallet-spend") {
      setWalletSpendInputHash("");
      setWalletSpendInputIndex("");
      setWalletSpendRedeemerPreset({ ...DEFAULT_REQUIRED_CONSTR_PRESET });
      setWalletSpendOutputs([]);
      clearPreviewResult();
      clearBuildMessages();
      return;
    }

    if (action === "wallet-publish") {
      setPublishCertificateJson("{}");
      setPublishSttInputHash(selectedDetectedToken?.utxo.input.txHash ?? "");
      setPublishSttInputIndex(
        selectedDetectedToken ? selectedDetectedToken.utxo.input.outputIndex.toString() : ""
      );
      setPublishSttStateForm(
        cloneStateForm(
          selectedDetectedToken
            ? stateFormFromDatum(selectedDetectedToken.datum)
            : createDefaultStateForm()
        )
      );
      setPublishSttAssets([]);
      setPublishZeroAdminConfirmed(false);
      clearPreviewResult();
      clearBuildMessages();
      return;
    }

    if (action === "wallet-propose") {
      setProposalJson("{}");
      setProposalSttInputHash(selectedDetectedToken?.utxo.input.txHash ?? "");
      setProposalSttInputIndex(
        selectedDetectedToken ? selectedDetectedToken.utxo.input.outputIndex.toString() : ""
      );
      setProposalSttStateForm(
        cloneStateForm(
          selectedDetectedToken
            ? stateFormFromDatum(selectedDetectedToken.datum)
            : createDefaultStateForm()
        )
      );
      setProposalSttAssets([]);
      setProposalZeroAdminConfirmed(false);
      clearPreviewResult();
      clearBuildMessages();
      return;
    }

    setWithdrawRewardAddress("");
    setWithdrawAmount("1000000");
    setWithdrawSttInputHash(selectedDetectedToken?.utxo.input.txHash ?? "");
    setWithdrawSttInputIndex(
      selectedDetectedToken ? selectedDetectedToken.utxo.input.outputIndex.toString() : ""
    );
    setWithdrawSttStateForm(
      cloneStateForm(
        selectedDetectedToken ? stateFormFromDatum(selectedDetectedToken.datum) : createDefaultStateForm()
      )
    );
    setWithdrawZeroAdminConfirmed(false);
    setWithdrawSttAssets([]);
    setWalletOperatorPath("admin");
    clearPreviewResult();
    clearBuildMessages();
  }

  return {
    resetActionDraft,
    clearActionDraft
  };
}
