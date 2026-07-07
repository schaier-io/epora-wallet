"use client";

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
import { type useWalletSpendForm } from "@/components/user/workspace/forms/use-wallet-spend-form";
import { type useMintForm } from "@/components/user/workspace/forms/use-mint-form";
import { type useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";
import { type usePublishForm } from "@/components/user/workspace/forms/use-publish-form";
import { type useVoteForm } from "@/components/user/workspace/forms/use-vote-form";
import { type useConsolidateForm } from "@/components/user/workspace/forms/use-consolidate-form";
import { cloneStateForm, resolveWalletWrapperSttInputRef, safeStringify } from "@/components/user/workspace/helpers";

export type BuildActionSignatureCtx = ReturnType<typeof useMintForm> &
  ReturnType<typeof useSttSpendForm> &
  ReturnType<typeof useWithdrawForm> &
  ReturnType<typeof usePublishForm> &
  ReturnType<typeof useVoteForm> &
  ReturnType<typeof useConsolidateForm> &
  ReturnType<typeof useLockFundsForm> &
  ReturnType<typeof useWalletSpendForm> &
  ReturnType<typeof useTransferForm> &
  {
  activePaymentKeyHash: string | null;
  config: ContractConfig;
  selectedDetectedToken: DetectedSttToken | null;
  selectedDetectedTokenStateForm: StateFormState | null;
};

export function computeActionSignature(action: UserActionKind, ctx: BuildActionSignatureCtx) {
  const {
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
    withdrawZeroAdminConfirmed
  } = ctx;
    switch (action) {
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
          sttZeroAdminConfirmed
        });
      case "consolidate-utxo":
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
      case "wallet-spend":
        return safeStringify({
          config,
          walletSpendInputHash,
          walletSpendInputIndex,
          walletSpendRedeemerPreset,
          walletSpendOutputs
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
      default:
        return "";
    }
}
