import { STT_SPEND_VALIDATOR, assertValidAssetList, assertValidConstrData, buildReferenceScriptDiagnostics, buildTransactionWithReestimatedLimits, createInputRefKey, createTxPreview, describeReferenceScriptUsage, findUtxo, mergeRestrictedSttAssets, redeemValueWithRequiredReferenceScript, resolveSharedSttReferenceScript, sendAssetsWithOptionalInlineDatumAndReferenceScript, setupTransaction, validateForwardedStateDatum, withStage, withWalletWitness } from "./internals";
import { type OnChainStructuredAction, buildSttSpendRedeemerData, buildWalletWitnessData } from "@/lib/contracts/action-data";
import { getSttSpendScript, resolveScriptAddress } from "@/lib/contracts/blueprint";
import { type BuildResult, type ContractConfig, type SetIntendedStakeCredentialFormInput } from "@/lib/types/contracts";
import { type BrowserWallet } from "@meshsdk/core";

// Set the wallet's `intended_stake_credential` (the stake credential every
// continuing wallet output must use). This forwards the STT State with the new
// credential written into its datum, witnessed by the operator path via the
// dedicated `SetIntendedStakeCredential` redeemer — the only action allowed to
// change that field. It moves NO wallet funds: the existing wallet UTxOs become
// "orphans" at the previous address and are migrated to the new base address in
// a follow-up consolidate step (or surfaced by the Koios orphan resolver).
export async function buildSetIntendedStakeCredentialTx(
  wallet: BrowserWallet,
  config: ContractConfig,
  input: SetIntendedStakeCredentialFormInput
): Promise<BuildResult> {
  const stage = "set-intended-stake-credential";
  const onChainAction: OnChainStructuredAction = {
    kind: "set-intended-stake-credential",
    operatorPath: input.authorityPath === "multisig" ? "multisig" : "admin",
    stakeCredential: input.stakeCredential
  };

  assertValidConstrData(input.sttOutputDatum, "Stake-credential STT output datum");
  assertValidAssetList(input.sttOutputAssets, "Stake-credential STT output assets");

  const sttScript = getSttSpendScript();
  const sttAddress = resolveScriptAddress(sttScript);
  const forwardedDatum = withWalletWitness(
    input.sttOutputDatum,
    buildWalletWitnessData(onChainAction)
  );
  validateForwardedStateDatum(
    forwardedDatum,
    onChainAction,
    `${stage}:validateStateDatum`,
    "Forwarded STT output datum is invalid."
  );

  const prepared = await buildTransactionWithReestimatedLimits(
    `${stage}:tx.draft-build`,
    `${stage}:tx.build`,
    async (overrides) => {
      const { tx, fetcher, setupDiagnostics } = await setupTransaction(wallet);
      const spendValidatorsByRef = new Map<string, string>();
      const sttUtxos = await withStage(
        `${stage}:fetchSttUtxos`,
        async () => fetcher.fetchAddressUTxOs(sttAddress),
        { ...setupDiagnostics, sttAddress }
      );
      const sttInput = findUtxo(
        sttUtxos,
        input.sttInputTxHash,
        input.sttInputOutputIndex
      );
      // A pure state-field change: the STT output keeps the State token and may
      // only top up (never reduce) lovelace — `mergeRestrictedSttAssets` enforces
      // that, so no value can leak out under cover of the credential change.
      const forwardedAssets = mergeRestrictedSttAssets(
        input.sttOutputAssets,
        sttInput.output.amount,
        "update-state"
      );
      const sttReferenceScript = await resolveSharedSttReferenceScript(fetcher, {
        configuredReference: config.sttSpendReference,
        script: sttScript,
        stage: `${stage}:resolveSharedSttReferenceScript`,
        details: { ...setupDiagnostics, sttAddress },
        excludedRefs: [createInputRefKey(sttInput.input.txHash, sttInput.input.outputIndex)]
      });
      const scriptWitnessDiagnostics = buildReferenceScriptDiagnostics([
        { label: "STT", script: sttScript, reference: sttReferenceScript }
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

      sendAssetsWithOptionalInlineDatumAndReferenceScript(
        tx,
        sttAddress,
        forwardedAssets,
        forwardedDatum
      );

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          action: stage,
          sttAddress,
          sttInputTxHash: input.sttInputTxHash,
          sttInputOutputIndex: input.sttInputOutputIndex,
          stakeCredentialKind: input.stakeCredential.kind,
          scriptWitnessDiagnostics
        },
        executionLabels: {
          mintValidators: [],
          rewardValidators: [],
          spendValidatorsByRef
        },
        context: {
          referenceScriptUsage: describeReferenceScriptUsage(scriptWitnessDiagnostics)
        }
      };
    }
  );

  const referenceScriptUsage =
    typeof prepared.context?.referenceScriptUsage === "string"
      ? prepared.context.referenceScriptUsage
      : "";

  return {
    txHex: prepared.txHex,
    preview: createTxPreview(
      stage,
      `Set the wallet's intended stake credential (${input.stakeCredential.kind})${referenceScriptUsage}`,
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits
  };
}
