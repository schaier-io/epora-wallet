"use client";

import type { GuidedActionDraftContext } from "@/components/user/guided-action-adapters";

import {
  countAdminUsersInStateForm,
  type StateFormState
} from "@/lib/contracts/state-form";

import {
  type DetectedSttToken
} from "@/lib/mesh/detection";

import {
  type Asset,
  type AuthorityPath,
  type ConsolidateAuthorityPath,
  type OperatorAuthorityPath,
  type PayoutTransfer,
  type WalletInputRef } from "@/lib/types/contracts";
import {
  type TransferFormState,
  type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { type AllowancePreviewResult } from "@/components/user/workspace/workspace-allowance-preview";
import { DEFAULT_MINT_STARTER_ASSETS } from "@/components/user/workspace/constants";
import { formatReceiptAmountSummary, resolveWalletWrapperSttInputRef, safeStringify } from "@/components/user/workspace/helpers";

export interface DraftContextCtx {
  consolidateAuthorityPath: ConsolidateAuthorityPath;
  consolidateSttInputHash: string;
  consolidateWalletInputs: WalletInputRef[];
  consolidateWalletOutputs: WalletScriptOutputFormState[];
  lockFundsAssets: Asset[];
  mintStarterAssets: Asset[];
  mintStateForm: StateFormState;
  proposalJson: string;
  proposalSttInputHash: string;
  proposalSttInputIndex: string;
  publishCertificateJson: string;
  publishSttInputHash: string;
  publishSttInputIndex: string;
  sttAuthorityPath: AuthorityPath;
  sttExtraTransfers: TransferFormState[];
  sttInputTxHash: string;
  sttWalletInputs: WalletInputRef[];
  sttWalletOutputs: WalletScriptOutputFormState[];
  walletOperatorPath: OperatorAuthorityPath;
  walletSpendInputHash: string;
  walletSpendOutputs: TransferFormState[];
  withdrawAmount: string;
  withdrawRewardAddress: string;
  withdrawSttInputHash: string;
  withdrawSttInputIndex: string;
  autoMintStateForm: StateFormState;
  selectedDetectedToken: DetectedSttToken | null;
  streamingPaymentPayoutTransfers: PayoutTransfer[];
  useAllowancePreview: AllowancePreviewResult;
}

export function computeDraftContext(
  ctx: DraftContextCtx
): Omit<GuidedActionDraftContext, "actionReadinessMap"> {
  const {
    consolidateAuthorityPath,
    consolidateSttInputHash,
    consolidateWalletInputs,
    consolidateWalletOutputs,
    lockFundsAssets,
    mintStarterAssets,
    mintStateForm,
    proposalJson,
    proposalSttInputHash,
    proposalSttInputIndex,
    publishCertificateJson,
    publishSttInputHash,
    publishSttInputIndex,
    sttAuthorityPath,
    sttExtraTransfers,
    sttInputTxHash,
    sttWalletInputs,
    sttWalletOutputs,
    walletOperatorPath,
    walletSpendInputHash,
    walletSpendOutputs,
    withdrawAmount,
    withdrawRewardAddress,
    withdrawSttInputHash,
    withdrawSttInputIndex,
    autoMintStateForm,
    selectedDetectedToken,
    streamingPaymentPayoutTransfers,
    useAllowancePreview
  } = ctx;
  return {
      mint: {
        adminUserCount: countAdminUsersInStateForm(mintStateForm),
        currentStateJson: safeStringify(mintStateForm),
        defaultStateJson: safeStringify(autoMintStateForm),
        starterFundsJson: safeStringify(mintStarterAssets),
        defaultStarterFundsJson: safeStringify(DEFAULT_MINT_STARTER_ASSETS),
        starterFundsSummary: formatReceiptAmountSummary(mintStarterAssets)
      },
      stt: {
        inputHash: sttInputTxHash,
        walletInputCount: sttWalletInputs.length,
        walletOutputCount: sttWalletOutputs.length,
        transferCount: sttExtraTransfers.length,
        streamingPaymentTransferCount: streamingPaymentPayoutTransfers.length,
        authorityPath: sttAuthorityPath === "multisig" ? "multisig" : "admin",
        detectedTokenActive: Boolean(selectedDetectedToken)
      },
      useAllowance: {
        matchedUserId: useAllowancePreview.target?.matchedUserId ?? null
      },
      consolidate: {
        inputHash: consolidateSttInputHash,
        walletInputCount: consolidateWalletInputs.length,
        walletOutputCount: consolidateWalletOutputs.length,
        authorityPath: consolidateAuthorityPath
      },
      lockFunds: {
        assetCount: lockFundsAssets.length,
        hasCustomInlineDatum: false
      },
      walletSpend: {
        inputHash: walletSpendInputHash,
        outputCount: walletSpendOutputs.length
      },
      walletWithdraw: {
        rewardAddress: withdrawRewardAddress,
        amount: withdrawAmount,
        sttInputHash: resolveWalletWrapperSttInputRef(
          selectedDetectedToken,
          withdrawSttInputHash,
          withdrawSttInputIndex
        ).txHash,
        authorityPath: walletOperatorPath
      },
      walletPublish: {
        certificateJson: publishCertificateJson,
        sttInputHash: resolveWalletWrapperSttInputRef(
          selectedDetectedToken,
          publishSttInputHash,
          publishSttInputIndex
        ).txHash,
        authorityPath: walletOperatorPath
      },
      walletPropose: {
        proposalJson,
        sttInputHash: resolveWalletWrapperSttInputRef(
          selectedDetectedToken,
          proposalSttInputHash,
          proposalSttInputIndex
        ).txHash,
        authorityPath: walletOperatorPath
      }
  };
}
