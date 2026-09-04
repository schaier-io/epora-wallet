import { type RuntimeTxBuilder, WALLET_WITHDRAW_VALIDATOR, addExtraRequiredSigners, applyWithdrawalWitness, buildTransactionWithReestimatedLimits, createStateForwarding, createTxPreview, fetchChangeAddressReferenceUtxos, mergeAssetsByUnit, resolveReferenceScript, runStateForwarding, setupTransaction, validateForwardedStateDatum } from "./internals";
import { formatRewardWithdrawalPreview } from "./preview-copy";
import { buildOperatorPathData, buildSttSpendRedeemerData, resolveOperatorOnChainAction } from "@/lib/contracts/action-data";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { getWalletWithdrawScript } from "@/lib/contracts/blueprint";
import { type BuildResult, type ContractConfig, type WalletWithdrawFormInput } from "@/lib/types/contracts";
import { type TxFetcher, type WalletSource } from "@/lib/mesh/tx-context";

export async function buildWalletWithdrawTx(
  wallet: WalletSource,
  config: ContractConfig,
  input: WalletWithdrawFormInput,
  txFetcher?: TxFetcher
): Promise<BuildResult> {
  const onChainAction = resolveOperatorOnChainAction(input.authorityPath);
  const stateForwarding = createStateForwarding(config);
  const sttParams = stateForwarding.params;
  const forwardedDatum = unwrapStateDatum(input.sttOutputDatum, "STT state datum");
  validateForwardedStateDatum(
    forwardedDatum,
    onChainAction,
    "wallet-withdraw:validateStateDatum",
    "Forwarded STT state datum is invalid."
  );

  const walletWithdrawScript = getWalletWithdrawScript({
    sttPolicyId: sttParams.sttPolicyId,
    sttAssetNameHex: sttParams.sttAssetNameHex
  });
  const prepared = await buildTransactionWithReestimatedLimits(
    "wallet-withdraw:tx.draft-build",
    "wallet-withdraw:tx.build",
    async (overrides) => {
      const { tx, fetcher, changeAddress, setupDiagnostics, walletUtxos } =
        await setupTransaction(wallet, undefined, txFetcher);
      addExtraRequiredSigners(tx, changeAddress, input.requiredSignerKeyHashes);
      const spendValidatorsByRef = new Map<string, string>();
      const changeAddressUtxos = await fetchChangeAddressReferenceUtxos(
        fetcher,
        changeAddress,
        "wallet-withdraw:fetchChangeAddressUtxos",
        {
          ...setupDiagnostics,
          sttAddress: stateForwarding.address,
          rewardAddress: input.rewardAddress
        }
      );
      const forwarding = await runStateForwarding({
        definition: stateForwarding,
        fetcher,
        tx,
        input: {
          txHash: input.sttInputTxHash,
          outputIndex: input.sttInputOutputIndex,
          stage: "wallet-withdraw:fetchSttUtxos",
          details: setupDiagnostics
        },
        reference: {
          stage: "wallet-withdraw:resolveSharedSttReferenceScript",
          details: setupDiagnostics
        },
        spendValidatorsByRef,
        afterInput: ({ input: stateInput }) =>
          mergeAssetsByUnit(input.sttOutputAssets, stateInput.input.output.amount),
        beforeRedeem: async ({ resolved, value: forwardedAssets }) => {
          const walletWithdrawReference = await resolveReferenceScript(fetcher, {
            label: "Wallet withdraw",
            configuredReference: config.walletWithdrawReference,
            script: walletWithdrawScript,
            stage: "wallet-withdraw:resolveWalletReferenceScript",
            details: { ...setupDiagnostics, rewardAddress: input.rewardAddress },
            candidateSets: [
              { source: "wallet-utxos", utxos: walletUtxos },
              { source: "wallet-change-address", utxos: changeAddressUtxos }
            ]
          });

          return {
            assets: forwardedAssets,
            datum: forwardedDatum,
            redeemer: buildSttSpendRedeemerData(onChainAction),
            budget: overrides?.spendBudgetsByRef.get(resolved.inputRef),
            additionalWitnesses: [
              {
                label: "Wallet withdraw",
                script: walletWithdrawScript,
                reference: walletWithdrawReference
              }
            ],
            afterOutput: () => {
              applyWithdrawalWitness(
                tx.txBuilder as RuntimeTxBuilder,
                input.rewardAddress,
                input.amountLovelace,
                walletWithdrawScript,
                walletWithdrawReference,
                buildOperatorPathData(input.authorityPath),
                overrides?.rewardBudgets[0]
              );
            }
          };
        }
      });

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          ...forwarding.diagnostics,
          rewardAddress: input.rewardAddress,
          amountLovelace: input.amountLovelace
        },
        executionLabels: {
          mintValidators: [],
          rewardValidators: [WALLET_WITHDRAW_VALIDATOR],
          spendValidatorsByRef
        },
        context: {
          referenceScriptUsage: forwarding.referenceScriptUsage
        }
      };
    },
    txFetcher
  );
  const referenceScriptUsage =
    typeof prepared.context?.referenceScriptUsage === "string"
      ? prepared.context.referenceScriptUsage
      : "";

  return {
    txHex: prepared.txHex,
    preview: createTxPreview(
      "wallet-withdraw",
      formatRewardWithdrawalPreview(input.amountLovelace, input.rewardAddress, referenceScriptUsage),
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    signerAddress: prepared.signerAddress,
    executionUnits: prepared.executionUnits
  };
}
