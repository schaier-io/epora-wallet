"use client";
import type { UTxO } from "@meshsdk/core";

import type {
  UserActionKind
} from "@/components/user/flow-types";

import {
  type StateFormState
} from "@/lib/contracts/state-form";

import {
  type DetectedSttToken
} from "@/lib/mesh/detection";

import {
  type ContractConfig } from "@/lib/types/contracts";
import { type useWithdrawForm } from "@/components/user/workspace/forms/use-withdraw-form";
import { type useTransferForm } from "@/components/user/workspace/forms/use-transfer-form";
import { type useLockFundsForm } from "@/components/user/workspace/forms/use-lock-funds-form";
import { type useMintForm } from "@/components/user/workspace/forms/use-mint-form";
import { type useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";
import { type usePublishForm } from "@/components/user/workspace/forms/use-publish-form";
import { type useVoteForm } from "@/components/user/workspace/forms/use-vote-form";
import { type useConsolidateForm } from "@/components/user/workspace/forms/use-consolidate-form";
import { cloneStateForm, resolveWalletWrapperSttInputRef, safeStringify } from "@/components/user/workspace/helpers";
import type { PreparedStreamingPaymentPayout } from "@/components/user/workspace/workspace-payout-preparation";

export type BuildActionSignatureCtx = ReturnType<typeof useMintForm> &
  ReturnType<typeof useSttSpendForm> &
  ReturnType<typeof useWithdrawForm> &
  ReturnType<typeof usePublishForm> &
  ReturnType<typeof useVoteForm> &
  ReturnType<typeof useConsolidateForm> &
  ReturnType<typeof useLockFundsForm> &
  ReturnType<typeof useTransferForm> &
  {
  activeInferredSttStateForm: StateFormState;
  activePaymentKeyHash: string | null;
  config: ContractConfig;
  streamingPaymentPayout: PreparedStreamingPaymentPayout;
  lockedContractUtxos?: UTxO[];
  selectedDetectedToken: DetectedSttToken | null;
  selectedDetectedTokenStateForm: StateFormState | null;
};

export function computeActionSignature(action: UserActionKind, ctx: BuildActionSignatureCtx) {
  const {
    activeInferredSttStateForm,
    activePaymentKeyHash,
    config,
    consolidateAuthorityPath,
    consolidateStateForm,
    consolidateSttAssets,
    consolidateSttInputHash,
    consolidateSttInputIndex,
    consolidateWalletInputs,
    consolidateWalletOutputs,
    lockFundsAssets,
    mintReference,
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
    streamingPaymentPayout,
    walletOperatorPath,
    withdrawAmount,
    withdrawRewardAddress,
    withdrawSttAssets,
    withdrawSttInputHash,
    withdrawSttInputIndex,
    withdrawSttStateForm,
    withdrawZeroAdminConfirmed
  } = ctx;
    switch (action) {
      case "distribute-beneficiaries":
        return safeStringify({ config, action, sttInputTxHash, sttInputOutputIndex,
          activePaymentKeyHash, state: selectedDetectedTokenStateForm ?? sttStateForm, sttWalletInputs,
          walletInputs: ctx.lockedContractUtxos?.filter((utxo) => sttWalletInputs.some((ref) =>
            ref.txHash === utxo.input.txHash && ref.outputIndex === utxo.input.outputIndex)) });
      case "stop-beneficiary-stream":
        return safeStringify({ config, action, sttInputTxHash, sttInputOutputIndex,
          activePaymentKeyHash, selectedDetectedTokenStateForm,
          beneficiaryStreamStopId: ctx.beneficiaryStreamStopId });
      case "mint":
        return safeStringify({
          mintReference,
          mintStarterAssets,
          mintStateForm,
          activePaymentKeyHash,
          mintZeroAdminConfirmed
        });
      case "use":
      case "renew-proof-of-life":
      case "update-state":
      case "manage-streaming-payments":
      case "use-allowance":
      case "use-beneficiary":
      case "payout-streaming-payment":
        return safeStringify({
          config,
          action,
          sttInputTxHash,
          sttInputOutputIndex,
          sttStateForm,
          sttOutputAssets,
          sttWalletInputs,
          sttWalletOutputs,
          sttExtraTransfers,
          sttAuthorityPath,
          activePaymentKeyHash,
          sttProofOfLifeOverrideMode,
          sttProofOfLifeSpecificDateTime,
          sttZeroAdminConfirmed,
          ...(action === "payout-streaming-payment"
            ? { streamingPaymentPayoutIdentity: streamingPaymentPayout.identity }
            : {})
        });
      case "consolidate-utxo":
        if (ctx.beneficiaryPreparationActive) return safeStringify({
          config, action, activePaymentKeyHash,
          state: selectedDetectedTokenStateForm ?? consolidateStateForm,
          consolidateSttInputHash, consolidateSttInputIndex, consolidateWalletInputs,
          preparation: ctx.beneficiaryPreparationActive, poolAssets: ctx.beneficiaryPreparationPoolAssets,
          walletInputs: ctx.lockedContractUtxos?.filter(utxo => consolidateWalletInputs.some(ref => ref.txHash === utxo.input.txHash && ref.outputIndex === utxo.input.outputIndex))
        });
        return safeStringify({
          config,
          action,
          consolidateSttInputHash,
          consolidateSttInputIndex,
          consolidateStateForm,
          consolidateSttAssets,
          consolidateAuthorityPath,
          consolidateWalletInputs,
          consolidateWalletOutputs
        });
      case "lock-funds":
        return safeStringify({
          config,
          lockFundsAssets
        });
      case "wallet-withdraw": {
        const wRef = resolveWalletWrapperSttInputRef(
          selectedDetectedToken,
          withdrawSttInputHash,
          withdrawSttInputIndex
        );
        return safeStringify({
          config,
          withdrawRewardAddress,
          withdrawAmount,
          withdrawSttInputHash: wRef.txHash,
          withdrawSttInputIndex: wRef.indexStr,
          withdrawSttStateForm,
          withdrawSttAssets,
          walletOperatorPath,
          withdrawZeroAdminConfirmed
        });
      }
      case "wallet-publish": {
        const pubSigRef = resolveWalletWrapperSttInputRef(
          selectedDetectedToken,
          publishSttInputHash,
          publishSttInputIndex
        );
        const publishSigState = selectedDetectedTokenStateForm
          ? cloneStateForm(selectedDetectedTokenStateForm)
          : cloneStateForm(publishSttStateForm);
        return safeStringify({
          config,
          publishCertificateJson,
          publishSttInputHash: pubSigRef.txHash,
          publishSttInputIndex: pubSigRef.indexStr,
          publishSttStateForm: publishSigState,
          publishSttAssets,
          walletOperatorPath,
          publishZeroAdminConfirmed
        });
      }
      case "wallet-vote": {
        const voteSigRef = resolveWalletWrapperSttInputRef(
          selectedDetectedToken,
          voteSttInputHash,
          voteSttInputIndex
        );
        const voteSigState = selectedDetectedTokenStateForm
          ? cloneStateForm(selectedDetectedTokenStateForm)
          : cloneStateForm(voteSttStateForm);
        return safeStringify({
          config,
          voteJson,
          voteSttInputHash: voteSigRef.txHash,
          voteSttInputIndex: voteSigRef.indexStr,
          voteSttStateForm: voteSigState,
          voteSttAssets,
          walletOperatorPath,
          voteZeroAdminConfirmed
        });
      }
      case "set-intended-stake-credential": {
        const stakeSigRef = resolveWalletWrapperSttInputRef(selectedDetectedToken, "", "");
        return safeStringify({
          config,
          action,
          activePaymentKeyHash,
          stakeSttInputHash: stakeSigRef.txHash,
          stakeSttInputIndex: stakeSigRef.indexStr,
          stakeSttStateForm: cloneStateForm(
            selectedDetectedTokenStateForm ?? activeInferredSttStateForm
          ),
          walletOperatorPath
        });
      }
      default:
        return "";
    }
}
