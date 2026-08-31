import { WALLET_SPEND_VALIDATOR, assertValidAssetList, assertValidConsolidationLayout, assertValidConstrData, assertValidWalletInputRefs, assertValidWalletOutputs, buildReferenceScriptDiagnostics, buildTransactionWithReestimatedLimits, createInputRefKey, createStateForwarding, createTxPreview, describeReferenceScriptUsage, ensureUniqueWalletInputRefs, mergeAssetLists, mergeRestrictedSttAssets, recipientWithOptionalInlineDatum, redeemStateForwardingInput, redeemValueWithInlineScript, resolveExactWalletInputUtxos, resolveStateForwardingInput, resolveStateForwardingReference, sendStateForwardingOutput, setupTransaction, validateForwardedStateDatum, withStage } from "./internals";
import { formatConsolidationPreview } from "./preview-copy";
import { buildSttSpendRedeemerData, buildWalletSpendRedeemerData, resolveStructuredOnChainAction } from "@/lib/contracts/action-data";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { getWalletSpendScript, resolveWalletContinuingOutputAddressFromState, resolveWalletSpendScriptHash } from "@/lib/contracts/blueprint";
import { type BuildResult, type ConsolidateUtxosFormInput, type ContractConfig } from "@/lib/types/contracts";
import { type TxFetcher, type WalletSource } from "@/lib/mesh/tx-context";

export async function buildConsolidateUtxosTx(
  wallet: WalletSource,
  config: ContractConfig,
  input: ConsolidateUtxosFormInput,
  txFetcher?: TxFetcher
): Promise<BuildResult> {
  const onChainAction = resolveStructuredOnChainAction(
    "consolidate-utxo",
    input.authorityPath
  );
  const stateForwarding = createStateForwarding(config);
  const sttParams = stateForwarding.params;

  if (input.walletInputs.length < 1) {
    throw new Error("Consolidation requires at least one wallet script input.");
  }

  assertValidConstrData(input.outputDatum, "Consolidated STT output datum");
  assertValidAssetList(input.outputAssets, "Consolidated STT output assets");
  assertValidWalletInputRefs(input.walletInputs, "Consolidated wallet inputs");
  assertValidWalletOutputs(
    input.walletOutputs ?? [],
    "Consolidated wallet outputs"
  );

  ensureUniqueWalletInputRefs(input.walletInputs);
  const forwardedDatum = unwrapStateDatum(input.outputDatum, "STT state datum");
  validateForwardedStateDatum(
    forwardedDatum,
    onChainAction,
    "consolidate-utxo:validateStateDatum",
    "Consolidated STT output datum is invalid."
  );
  const walletScript = getWalletSpendScript({
    sttPolicyId: sttParams.sttPolicyId,
    sttAssetNameHex: sttParams.sttAssetNameHex
  });
  // Continuing wallet outputs follow the State's `intended_stake_credential`:
  // a staking (Some) wallet keeps its funds at the base address; a `None` wallet
  // resolves to the exact historical enterprise address (no behaviour change).
  const walletAddress = resolveWalletContinuingOutputAddressFromState({
    sttPolicyId: sttParams.sttPolicyId,
    sttAssetNameHex: sttParams.sttAssetNameHex,
    stateDatum: input.outputDatum
  });
  const walletPaymentScriptHash = resolveWalletSpendScriptHash({
    sttPolicyId: sttParams.sttPolicyId,
    sttAssetNameHex: sttParams.sttAssetNameHex
  });
  const prepared = await buildTransactionWithReestimatedLimits(
    "consolidate-utxo:tx.draft-build",
    "consolidate-utxo:tx.build",
    async (overrides) => {
      const { tx, fetcher, setupDiagnostics } = await setupTransaction(wallet, undefined, txFetcher);
      const spendValidatorsByRef = new Map<string, string>();
      const stateInput = await resolveStateForwardingInput(
        stateForwarding,
        fetcher,
        {
          txHash: input.sttInputTxHash,
          outputIndex: input.sttInputOutputIndex,
          stage: "consolidate-utxo:fetchSttUtxos",
          details: setupDiagnostics
        }
      );
      const walletInputs = await withStage(
        "consolidate-utxo:resolveWalletInputs",
        async () =>
          resolveExactWalletInputUtxos(
            fetcher,
            input.walletInputs,
            walletPaymentScriptHash
        ),
        { ...setupDiagnostics, walletAddress, walletPaymentScriptHash }
      );
      const resolvedState = await resolveStateForwardingReference(
        stateInput,
        fetcher,
        {
          stage: "consolidate-utxo:resolveSharedSttReferenceScript",
          details: setupDiagnostics
        }
      );
      const scriptWitnessDiagnostics = buildReferenceScriptDiagnostics([
        resolvedState.witness,
        { label: "Wallet spend", script: walletScript, reference: null }
      ]);
      redeemStateForwardingInput({
        tx,
        resolved: resolvedState,
        redeemer: buildSttSpendRedeemerData(onChainAction),
        budget: overrides?.spendBudgetsByRef.get(resolvedState.inputRef),
        spendValidatorsByRef
      });

      for (const walletInput of walletInputs) {
        spendValidatorsByRef.set(
          createInputRefKey(walletInput.input.txHash, walletInput.input.outputIndex),
          WALLET_SPEND_VALIDATOR
        );
        redeemValueWithInlineScript(tx, walletInput, walletScript, {
          data: buildWalletSpendRedeemerData(onChainAction),
          budget: overrides?.spendBudgetsByRef.get(
            createInputRefKey(walletInput.input.txHash, walletInput.input.outputIndex)
          )
        });
      }

      const forwardedAssets = mergeRestrictedSttAssets(
        input.outputAssets,
        resolvedState.input.output.amount,
        "consolidate-utxo"
      );
      sendStateForwardingOutput({
        tx,
        resolved: resolvedState,
        assets: forwardedAssets,
        datum: forwardedDatum
      });

      const walletOutputs =
        input.walletOutputs && input.walletOutputs.length > 0
          ? input.walletOutputs
          : [
              {
                amount: mergeAssetLists(
                  walletInputs.map((walletInput) => walletInput.output.amount)
                )
              }
            ];

      const { migratesAddress } = assertValidConsolidationLayout(
        walletInputs,
        walletAddress,
        walletOutputs.length
      );

      for (const walletOutput of walletOutputs) {
        tx.sendAssets(
          recipientWithOptionalInlineDatum(walletAddress, walletOutput.inlineDatum),
          walletOutput.amount
        );
      }

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          sttAddress: stateForwarding.address,
          walletAddress,
          sttInputTxHash: input.sttInputTxHash,
          sttInputOutputIndex: input.sttInputOutputIndex,
          walletInputs: input.walletInputs,
          walletOutputCount: walletOutputs.length,
          migratesAddress,
          scriptWitnessDiagnostics
        },
        executionLabels: {
          mintValidators: [],
          rewardValidators: [],
          spendValidatorsByRef
        },
        context: {
          walletInputCount: walletInputs.length,
          walletOutputCount: walletOutputs.length,
          migratesAddress,
          referenceScriptUsage: describeReferenceScriptUsage(scriptWitnessDiagnostics)
        }
      };
    },
    txFetcher
  );

  const walletInputCount =
    typeof prepared.context?.walletInputCount === "number"
      ? prepared.context.walletInputCount
      : input.walletInputs.length;
  const walletOutputCount =
    typeof prepared.context?.walletOutputCount === "number"
      ? prepared.context.walletOutputCount
      : input.walletOutputs?.length ?? 1;
  const referenceScriptUsage =
    typeof prepared.context?.referenceScriptUsage === "string"
      ? prepared.context.referenceScriptUsage
      : "";

  return {
    txHex: prepared.txHex,
    preview: createTxPreview(
      "consolidate-utxo",
      formatConsolidationPreview(walletInputCount, walletOutputCount, referenceScriptUsage),
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits
  };
}
