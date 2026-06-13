import { STT_SPEND_VALIDATOR, WALLET_SPEND_VALIDATOR, assertValidAssetList, assertValidConstrData, assertValidWalletInputRefs, assertValidWalletOutputs, buildReferenceScriptDiagnostics, buildTransactionWithReestimatedLimits, createInputRefKey, createTxPreview, describeReferenceScriptUsage, ensureUniqueWalletInputRefs, findUtxo, mergeAssetLists, mergeRestrictedSttAssets, recipientWithOptionalInlineDatum, redeemValueWithInlineScript, redeemValueWithRequiredReferenceScript, resolveSharedSttReferenceScript, resolveSttScriptParams, sendAssetsWithOptionalInlineDatumAndReferenceScript, setupTransaction, validateForwardedStateDatum, withStage } from "./internals";
import { buildSttSpendRedeemerData, buildWalletSpendRedeemerData, resolveStructuredOnChainAction } from "@/lib/contracts/action-data";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { getSttSpendScript, getWalletSpendScript, resolveScriptAddress, resolveWalletContinuingOutputAddressFromState } from "@/lib/contracts/blueprint";
import { type BuildResult, type ConsolidateUtxosFormInput, type ContractConfig } from "@/lib/types/contracts";
import { type BrowserWallet } from "@meshsdk/core";

export async function buildConsolidateUtxosTx(
  wallet: BrowserWallet,
  config: ContractConfig,
  input: ConsolidateUtxosFormInput
): Promise<BuildResult> {
  const onChainAction = resolveStructuredOnChainAction(
    "consolidate-utxo",
    input.authorityPath
  );
  const sttParams = resolveSttScriptParams(config);

  if (input.walletInputs.length < 2) {
    throw new Error("Consolidation requires at least two wallet script inputs.");
  }

  assertValidConstrData(input.outputDatum, "Consolidated STT output datum");
  assertValidAssetList(input.outputAssets, "Consolidated STT output assets");
  assertValidWalletInputRefs(input.walletInputs, "Consolidated wallet inputs");
  assertValidWalletOutputs(
    input.walletOutputs ?? [],
    "Consolidated wallet outputs"
  );

  ensureUniqueWalletInputRefs(input.walletInputs);
  const sttScript = getSttSpendScript();
  const sttAddress = resolveScriptAddress(sttScript);
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
  // The enterprise (no-stake) address for the same payment credential. Before a
  // wallet enabled staking its funds lived here; the enterprise→base migration
  // sweeps them to `walletAddress` (the base address) above. We scan both so a
  // selected input resolves whether it sits at the new canonical address or the
  // old enterprise one. For a `None` wallet the two are identical (one scan).
  const legacyWalletAddress = resolveScriptAddress(walletScript);
  const prepared = await buildTransactionWithReestimatedLimits(
    "consolidate-utxo:tx.draft-build",
    "consolidate-utxo:tx.build",
    async (overrides) => {
      const { tx, fetcher, setupDiagnostics } = await setupTransaction(wallet);
      const spendValidatorsByRef = new Map<string, string>();
      const sttUtxos = await withStage(
        "consolidate-utxo:fetchSttUtxos",
        async () => fetcher.fetchAddressUTxOs(sttAddress),
        { ...setupDiagnostics, sttAddress }
      );
      const sttInput = findUtxo(
        sttUtxos,
        input.sttInputTxHash,
        input.sttInputOutputIndex
      );
      const walletScriptUtxos = await withStage(
        "consolidate-utxo:fetchWalletUtxos",
        async () => {
          const scanAddresses =
            legacyWalletAddress === walletAddress
              ? [walletAddress]
              : [walletAddress, legacyWalletAddress];
          const fetched = await Promise.all(
            scanAddresses.map((address) => fetcher.fetchAddressUTxOs(address))
          );
          return fetched.flat();
        },
        { ...setupDiagnostics, walletAddress, legacyWalletAddress }
      );

      const walletInputs = input.walletInputs.map((ref) =>
        findUtxo(walletScriptUtxos, ref.txHash, ref.outputIndex)
      );
      const sttReferenceScript = await resolveSharedSttReferenceScript(fetcher, {
        configuredReference: config.sttSpendReference,
        script: sttScript,
        stage: "consolidate-utxo:resolveSharedSttReferenceScript",
        details: { ...setupDiagnostics, sttAddress },
        excludedRefs: [createInputRefKey(sttInput.input.txHash, sttInput.input.outputIndex)]
      });
      const scriptWitnessDiagnostics = buildReferenceScriptDiagnostics([
        {
          label: "STT",
          script: sttScript,
          reference: sttReferenceScript
        },
        { label: "Wallet spend", script: walletScript, reference: null }
      ]);
      spendValidatorsByRef.set(
        createInputRefKey(sttInput.input.txHash, sttInput.input.outputIndex),
        STT_SPEND_VALIDATOR
      );

      redeemValueWithRequiredReferenceScript(tx, sttInput, sttReferenceScript, {
        data: buildSttSpendRedeemerData(onChainAction),
        budget: overrides?.spendBudgetsByRef.get(
          createInputRefKey(sttInput.input.txHash, sttInput.input.outputIndex)
        )
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

      sendAssetsWithOptionalInlineDatumAndReferenceScript(
        tx,
        sttAddress,
        mergeRestrictedSttAssets(
          input.outputAssets,
          sttInput.output.amount,
          "consolidate-utxo"
        ),
        forwardedDatum
      );

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

      if (walletOutputs.length >= walletInputs.length) {
        throw new Error(
          "Consolidation must reduce the number of wallet script outputs."
        );
      }

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
          sttAddress,
          walletAddress,
          sttInputTxHash: input.sttInputTxHash,
          sttInputOutputIndex: input.sttInputOutputIndex,
          walletInputs: input.walletInputs,
          walletOutputCount: walletOutputs.length,
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
          referenceScriptUsage: describeReferenceScriptUsage(scriptWitnessDiagnostics)
        }
      };
    }
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
      `Consolidate ${walletInputCount} wallet UTxOs into ${walletOutputCount} output(s)${referenceScriptUsage}`,
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits
  };
}

