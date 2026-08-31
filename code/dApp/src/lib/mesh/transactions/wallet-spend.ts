import { WALLET_SPEND_VALIDATOR, assertValidConstrData, assertValidPayoutTransfers, buildReferenceScriptDiagnostics, buildTransactionWithReestimatedLimits, createInputRefKey, createTxPreview, describeReferenceScriptUsage, findUtxo, recipientWithOptionalInlineDatum, redeemValueWithInlineScript, setupTransaction, withStage } from "./internals";
import { formatWalletSpendPreview } from "./preview-copy";
import { getWalletSpendScript, resolveScriptAddress } from "@/lib/contracts/blueprint";
import { type BuildResult, type ContractConfig, type WalletSpendFormInput } from "@/lib/types/contracts";
import { type TxFetcher, type WalletSource } from "@/lib/mesh/tx-context";

export async function buildWalletSpendTx(
  wallet: WalletSource,
  config: ContractConfig,
  input: WalletSpendFormInput,
  txFetcher?: TxFetcher
): Promise<BuildResult> {
  if (!config.walletPolicyId || !config.walletAssetNameHex) {
    throw new Error("Wallet script parameters are missing. Set policy ID and asset name.");
  }

  assertValidConstrData(input.redeemer, "Wallet spend redeemer");
  assertValidPayoutTransfers(input.outputs, "Wallet spend outputs");

  const walletScript = getWalletSpendScript({
    sttPolicyId: config.walletPolicyId,
    sttAssetNameHex: config.walletAssetNameHex
  });

  const walletAddress = resolveScriptAddress(walletScript);
  const prepared = await buildTransactionWithReestimatedLimits(
    "wallet-spend:tx.draft-build",
    "wallet-spend:tx.build",
    async (overrides) => {
      const { tx, fetcher, setupDiagnostics } = await setupTransaction(wallet, undefined, txFetcher);
      const spendValidatorsByRef = new Map<string, string>();
      const walletScriptUtxos = await withStage(
        "wallet-spend:fetchScriptUtxos",
        async () => fetcher.fetchAddressUTxOs(walletAddress),
        { ...setupDiagnostics, walletAddress }
      );
      const scriptInput = findUtxo(
        walletScriptUtxos,
        input.walletInputTxHash,
        input.walletInputOutputIndex
      );
      const scriptWitnessDiagnostics = buildReferenceScriptDiagnostics([
        { label: "Wallet spend", script: walletScript, reference: null }
      ]);
      spendValidatorsByRef.set(
        createInputRefKey(scriptInput.input.txHash, scriptInput.input.outputIndex),
        WALLET_SPEND_VALIDATOR
      );

      redeemValueWithInlineScript(tx, scriptInput, walletScript, {
        data: input.redeemer,
        budget: overrides?.spendBudgetsByRef.get(
          createInputRefKey(scriptInput.input.txHash, scriptInput.input.outputIndex)
        )
      });

      for (const output of input.outputs) {
        tx.sendAssets(
          recipientWithOptionalInlineDatum(output.address, output.inlineDatum),
          output.amount
        );
      }

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          walletAddress,
          walletInputTxHash: input.walletInputTxHash,
          walletInputOutputIndex: input.walletInputOutputIndex,
          scriptWitnessDiagnostics
        },
        executionLabels: {
          mintValidators: [],
          rewardValidators: [],
          spendValidatorsByRef
        },
        context: {
          scriptInputRef: createInputRefKey(scriptInput.input.txHash, scriptInput.input.outputIndex),
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
      "wallet-spend",
      formatWalletSpendPreview(referenceScriptUsage),
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits
  };
}
