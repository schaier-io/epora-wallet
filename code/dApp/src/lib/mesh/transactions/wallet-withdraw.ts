import { type RuntimeTxBuilder, WALLET_WITHDRAW_VALIDATOR, applyWithdrawalWitness, buildReferenceScriptDiagnostics, buildTransactionWithReestimatedLimits, createStateForwarding, createTxPreview, describeReferenceScriptUsage, fetchChangeAddressReferenceUtxos, mergeAssetsByUnit, redeemStateForwardingInput, resolveReferenceScript, resolveStateForwardingInput, resolveStateForwardingReference, sendStateForwardingOutput, setupTransaction, validateForwardedStateDatum } from "./internals";
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
      const stateInput = await resolveStateForwardingInput(
        stateForwarding,
        fetcher,
        {
          txHash: input.sttInputTxHash,
          outputIndex: input.sttInputOutputIndex,
          stage: "wallet-withdraw:fetchSttUtxos",
          details: setupDiagnostics
        }
      );
      const forwardedAssets = mergeAssetsByUnit(
        input.sttOutputAssets,
        stateInput.input.output.amount
      );
      const resolvedState = await resolveStateForwardingReference(
        stateInput,
        fetcher,
        {
          stage: "wallet-withdraw:resolveSharedSttReferenceScript",
          details: setupDiagnostics
        }
      );
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
      const scriptWitnessDiagnostics = buildReferenceScriptDiagnostics([
        resolvedState.witness,
        {
          label: "Wallet withdraw",
          script: walletWithdrawScript,
          reference: walletWithdrawReference
        }
      ]);
      redeemStateForwardingInput({
        tx,
        resolved: resolvedState,
        redeemer: buildSttSpendRedeemerData(onChainAction),
        budget: overrides?.spendBudgetsByRef.get(resolvedState.inputRef),
        spendValidatorsByRef
      });
      sendStateForwardingOutput({
        tx,
        resolved: resolvedState,
        assets: forwardedAssets,
        datum: forwardedDatum
      });

      tx.withdrawRewards(input.rewardAddress, input.amountLovelace);
      applyWithdrawalWitness(
        tx.txBuilder as RuntimeTxBuilder,
        walletWithdrawScript,
        walletWithdrawReference,
        buildOperatorPathData(input.authorityPath),
        overrides?.rewardBudgets[0]
      );

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          sttAddress: stateForwarding.address,
          rewardAddress: input.rewardAddress,
          amountLovelace: input.amountLovelace,
          scriptWitnessDiagnostics
        },
        executionLabels: {
          mintValidators: [],
          rewardValidators: [WALLET_WITHDRAW_VALIDATOR],
          spendValidatorsByRef
        },
        context: {
          referenceScriptUsage: describeReferenceScriptUsage(scriptWitnessDiagnostics)
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
    executionUnits: prepared.executionUnits
  };
}
