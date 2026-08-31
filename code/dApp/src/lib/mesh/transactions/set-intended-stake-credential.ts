import { assertValidAssetList, assertValidConstrData, buildReferenceScriptDiagnostics, buildTransactionWithReestimatedLimits, createStateForwarding, createTxPreview, describeReferenceScriptUsage, mergeRestrictedSttAssets, redeemStateForwardingInput, resolveStateForwardingInput, resolveStateForwardingReference, sendStateForwardingOutput, setupTransaction, validateForwardedStateDatum } from "./internals";
import { formatStakeCredentialPreview } from "./preview-copy";
import { type OnChainStructuredAction, buildSttSpendRedeemerData } from "@/lib/contracts/action-data";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { type BuildResult, type ContractConfig, type SetIntendedStakeCredentialFormInput } from "@/lib/types/contracts";
import { type TxFetcher, type WalletSource } from "@/lib/mesh/tx-context";

// Set the wallet's `intended_stake_credential` (the stake credential every
// continuing wallet output must use). This forwards the STT State with the new
// credential written into its datum, witnessed by the operator path via the
// dedicated `SetIntendedStakeCredential` redeemer, the only action allowed to
// change that field. It moves NO wallet funds: the existing wallet UTxOs become
// "orphans" at the previous address and are migrated to the new base address in
// a follow-up consolidate step (or surfaced by the Koios orphan resolver).
export async function buildSetIntendedStakeCredentialTx(
  wallet: WalletSource,
  config: ContractConfig,
  input: SetIntendedStakeCredentialFormInput,
  txFetcher?: TxFetcher
): Promise<BuildResult> {
  const stage = "set-intended-stake-credential";
  const onChainAction: OnChainStructuredAction = {
    kind: "set-intended-stake-credential",
    operatorPath: input.authorityPath === "multisig" ? "multisig" : "admin",
    stakeCredential: input.stakeCredential
  };

  assertValidConstrData(input.sttOutputDatum, "Stake-credential STT output datum");
  assertValidAssetList(input.sttOutputAssets, "Stake-credential STT output assets");

  const stateForwarding = createStateForwarding(config);
  const forwardedDatum = unwrapStateDatum(input.sttOutputDatum, "STT state datum");
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
      const { tx, fetcher, setupDiagnostics } = await setupTransaction(wallet, undefined, txFetcher);
      const spendValidatorsByRef = new Map<string, string>();
      const stateInput = await resolveStateForwardingInput(
        stateForwarding,
        fetcher,
        {
          txHash: input.sttInputTxHash,
          outputIndex: input.sttInputOutputIndex,
          stage: `${stage}:fetchSttUtxos`,
          details: setupDiagnostics
        }
      );
      // A pure state-field change: the STT output keeps the State token and may
      // only top up (never reduce) lovelace. `mergeRestrictedSttAssets` enforces
      // that, so no value can leak out under cover of the credential change.
      const forwardedAssets = mergeRestrictedSttAssets(
        input.sttOutputAssets,
        stateInput.input.output.amount,
        "update-state"
      );
      const resolvedState = await resolveStateForwardingReference(
        stateInput,
        fetcher,
        {
          stage: `${stage}:resolveSharedSttReferenceScript`,
          details: setupDiagnostics
        }
      );
      const scriptWitnessDiagnostics = buildReferenceScriptDiagnostics([
        resolvedState.witness
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

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          action: stage,
          sttAddress: stateForwarding.address,
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
      stage,
      formatStakeCredentialPreview(input.stakeCredential.kind, referenceScriptUsage),
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits
  };
}
