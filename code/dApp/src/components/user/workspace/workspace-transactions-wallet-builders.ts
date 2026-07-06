"use client";
// Builders for the non-STT-spend actions: mint, lock-funds, and the wallet
// wrapper operations (spend / withdraw / publish / propose / enable staking).
// The STT spend family lives in workspace-transactions-stt-builders.ts.
import { countAdminUsersInStateForm, stateFormToDatum, type StateFormState } from "@/lib/contracts/state-form";
import {
  resolveWalletSpendScriptHash,
  resolveWalletStakeScriptCredentialData
} from "@/lib/contracts/blueprint";
import {
  buildLockFundsTx,
  buildMintStateTokenTx,
  buildSetIntendedStakeCredentialTx,
  buildWalletProposeTx,
  buildWalletPublishTx,
  buildWalletSpendTx,
  buildWalletWithdrawTx
} from "@/lib/mesh/transactions";
import { type ConstrData } from "@/lib/types/contracts";
import { MINT_PERFORMED_ACTION } from "@/components/user/workspace/constants";
import { cloneAssets, cloneStateForm, resolveOperatorActionAlternative, resolveWalletWrapperSttInputRef, serializeRequiredConstrPreset, serializeTransfers } from "@/components/user/workspace/helpers";
import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";
import { requireActiveWallet } from "@/components/user/workspace/workspace-transactions-guards";
import type { WorkspaceFormSnapshot } from "@/components/user/workspace/workspace-transactions-forms";

export function createWalletActionBuilders(
  ctx: WorkspaceTransactionsCtx,
  forms: WorkspaceFormSnapshot
) {
  const {
    activeInferredSttStateForm,
    activePaymentKeyHash,
    activeWallet,
    effectiveWalletAssetNameHex,
    lockingContract,
    selectedDetectedToken,
    selectedDetectedTokenAssets,
    selectedDetectedTokenStateForm,
    withBuildGuard
  } = ctx;
  const {
    config,
    lockFundsAssets,
    mintReference,
    mintStarterAssets,
    mintStateForm,
    proposalJson,
    proposalSttAssets,
    proposalSttInputHash,
    proposalSttInputIndex,
    proposalSttStateForm,
    publishCertificateJson,
    publishSttAssets,
    publishSttInputHash,
    publishSttInputIndex,
    publishSttStateForm,
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
    withdrawSttStateForm
  } = forms;

  async function buildMintTx() {
    return withBuildGuard(
      "mint",
      async () => {
        const mintState = cloneStateForm(mintStateForm);
        const stateDatum = stateFormToDatum(mintState, MINT_PERFORMED_ACTION);
        const selectedReference = (() => {
          if (!mintReference.trim()) return undefined;

          const [txHash, indexText] = mintReference.split("#");
          if (!txHash || typeof indexText === "undefined") {
            throw new Error("Reference UTxO format must be txHash#outputIndex");
          }

          return {
            txHash,
            outputIndex: Number(indexText)
          };
        })();

        return buildMintStateTokenTx(requireActiveWallet(activeWallet), {
          starterAssets: cloneAssets(mintStarterAssets),
          stateDatum,
          selectedReferenceUtxo: selectedReference
        });
      },
      {
        starterFundingMode: "derived-wallet-address",
        starterFunds: cloneAssets(mintStarterAssets),
        mintReference,
        hasWalletPaymentKeyHash: Boolean(activePaymentKeyHash),
        adminUsers: countAdminUsersInStateForm(mintStateForm)
      }
    );
  }

  async function buildLockFunds() {
    return withBuildGuard(
      "lock-funds",
      async () =>
        buildLockFundsTx(requireActiveWallet(activeWallet), config, {
          assets: cloneAssets(lockFundsAssets),
          inlineDatum: undefined,
          // Deposit to the wallet's canonical address — base address for a
          // staking wallet, enterprise (unchanged) otherwise.
          intendedStakeCredential:
            activeInferredSttStateForm.intendedStakeCredential as ConstrData
        }),
      {
        walletPolicyId: config.walletPolicyId,
        walletAssetNameHex: config.walletAssetNameHex,
        lockAddress: lockingContract.address,
        assetCount: lockFundsAssets.length
      }
    );
  }

  async function buildWalletSpend() {
    return withBuildGuard(
      "wallet-spend",
      async () =>
        buildWalletSpendTx(requireActiveWallet(activeWallet), config, {
          walletInputTxHash: walletSpendInputHash,
          walletInputOutputIndex: walletSpendInputIndex
            ? Number(walletSpendInputIndex)
            : undefined,
          redeemer: serializeRequiredConstrPreset(
            walletSpendRedeemerPreset,
            "Wallet spend redeemer"
          ),
          outputs: serializeTransfers(walletSpendOutputs)
        }),
      {
        walletInputTxHash: walletSpendInputHash,
        walletInputOutputIndex: walletSpendInputIndex,
        outputCount: walletSpendOutputs.length
      }
    );
  }

  async function buildWalletWithdraw() {
    const withdrawSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      withdrawSttInputHash,
      withdrawSttInputIndex
    );
    const withdrawSttOutIdx =
      withdrawSttRef.indexStr.trim() === "" ? undefined : Number(withdrawSttRef.indexStr);
    return withBuildGuard(
      "wallet-withdraw",
      async () =>
        buildWalletWithdrawTx(requireActiveWallet(activeWallet), config, {
          rewardAddress: withdrawRewardAddress,
          amountLovelace: withdrawAmount,
          sttInputTxHash: withdrawSttRef.txHash,
          sttInputOutputIndex: withdrawSttOutIdx,
          sttOutputDatum: stateFormToDatum(
            cloneStateForm(withdrawSttStateForm),
            resolveOperatorActionAlternative(walletOperatorPath)
          ),
          sttOutputAssets: cloneAssets(withdrawSttAssets),
          authorityPath: walletOperatorPath
        }),
      {
        rewardAddress: withdrawRewardAddress,
        amountLovelace: withdrawAmount,
        sttInputTxHash: withdrawSttRef.txHash,
        sttInputOutputIndex: withdrawSttRef.indexStr
      }
    );
  }

  async function buildWalletPublish() {
    const publishSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      publishSttInputHash,
      publishSttInputIndex
    );
    const publishSttOutIdx =
      publishSttRef.indexStr.trim() === "" ? undefined : Number(publishSttRef.indexStr);
    const publishGovernanceStateForm = selectedDetectedTokenStateForm
      ? cloneStateForm(selectedDetectedTokenStateForm)
      : cloneStateForm(publishSttStateForm);
    return withBuildGuard(
      "wallet-publish",
      async () =>
        buildWalletPublishTx(requireActiveWallet(activeWallet), config, {
          certificate: JSON.parse(publishCertificateJson),
          sttInputTxHash: publishSttRef.txHash,
          sttInputOutputIndex: publishSttOutIdx,
          sttOutputDatum: stateFormToDatum(
            cloneStateForm(publishGovernanceStateForm),
            resolveOperatorActionAlternative(walletOperatorPath)
          ),
          sttOutputAssets: cloneAssets(publishSttAssets),
          authorityPath: walletOperatorPath
        }),
      {
        sttInputTxHash: publishSttRef.txHash,
        sttInputOutputIndex: publishSttRef.indexStr
      }
    );
  }

  async function buildSetIntendedStakeCredential() {
    const setCredSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      "",
      ""
    );
    const setCredSttOutIdx =
      setCredSttRef.indexStr.trim() === "" ? undefined : Number(setCredSttRef.indexStr);
    const walletPolicyId = config.walletPolicyId?.trim() ?? "";
    const walletAssetNameHex = effectiveWalletAssetNameHex;
    // The wallet delegates via its OWN multi-purpose script, so the stake
    // credential is the same parameterized script hash as its payment credential.
    const stakeCredentialData = resolveWalletStakeScriptCredentialData({
      sttPolicyId: walletPolicyId,
      sttAssetNameHex: walletAssetNameHex
    });
    const walletScriptHash = resolveWalletSpendScriptHash({
      sttPolicyId: walletPolicyId,
      sttAssetNameHex: walletAssetNameHex
    });
    const baseStateForm = selectedDetectedTokenStateForm
      ? cloneStateForm(selectedDetectedTokenStateForm)
      : cloneStateForm(activeInferredSttStateForm);
    const nextStateForm: StateFormState = {
      ...baseStateForm,
      intendedStakeCredential: stakeCredentialData
    };
    return withBuildGuard(
      "set-intended-stake-credential",
      async () =>
        buildSetIntendedStakeCredentialTx(requireActiveWallet(activeWallet), config, {
          sttInputTxHash: setCredSttRef.txHash,
          sttInputOutputIndex: setCredSttOutIdx,
          sttOutputDatum: stateFormToDatum(
            nextStateForm,
            resolveOperatorActionAlternative(walletOperatorPath)
          ),
          sttOutputAssets: cloneAssets(selectedDetectedTokenAssets),
          authorityPath: walletOperatorPath,
          stakeCredential: { kind: "script", hashHex: walletScriptHash }
        }),
      {
        sttInputTxHash: setCredSttRef.txHash,
        sttInputOutputIndex: setCredSttRef.indexStr,
        stakeCredentialHash: walletScriptHash
      }
    );
  }

  async function buildWalletPropose() {
    const proposeSttRef = resolveWalletWrapperSttInputRef(
      selectedDetectedToken,
      proposalSttInputHash,
      proposalSttInputIndex
    );
    const proposeSttOutIdx =
      proposeSttRef.indexStr.trim() === "" ? undefined : Number(proposeSttRef.indexStr);
    const proposeGovernanceStateForm = selectedDetectedTokenStateForm
      ? cloneStateForm(selectedDetectedTokenStateForm)
      : cloneStateForm(proposalSttStateForm);
    return withBuildGuard(
      "wallet-propose",
      async () =>
        buildWalletProposeTx(requireActiveWallet(activeWallet), config, {
          proposal: JSON.parse(proposalJson),
          sttInputTxHash: proposeSttRef.txHash,
          sttInputOutputIndex: proposeSttOutIdx,
          sttOutputDatum: stateFormToDatum(
            cloneStateForm(proposeGovernanceStateForm),
            resolveOperatorActionAlternative(walletOperatorPath)
          ),
          sttOutputAssets: cloneAssets(proposalSttAssets),
          authorityPath: walletOperatorPath
        }),
      {
        sttInputTxHash: proposeSttRef.txHash,
        sttInputOutputIndex: proposeSttRef.indexStr
      }
    );
  }

  return {
    buildMintTx,
    buildLockFunds,
    buildWalletSpend,
    buildWalletWithdraw,
    buildWalletPublish,
    buildSetIntendedStakeCredential,
    buildWalletPropose
  };
}
