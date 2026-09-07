import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibMeshTransactionsSttSpend.json";
import { type RuntimeTxBuilder } from "./internals/budget-runtime-builder";
import { resolveBeneficiaryPreparation, validateBeneficiaryPreparationInput, type PreparationConsolidateInput, type PreparationOutputEvidence } from "./internals/beneficiary-preparation";
import { assertBeneficiaryPreparationOutputs } from "./internals/beneficiary-preparation-output-checks";
import { WALLET_SPEND_VALIDATOR, addExtraRequiredSigners, assertValidAssetList, assertValidConsolidationLayout, assertValidConstrData, assertValidWalletInputRefs, assertValidWalletOutputs, buildTransactionWithReestimatedLimits, createInputRefKey, createStateForwarding, createTxPreview, ensureUniqueWalletInputRefs, mergeAssetLists, mergeRestrictedSttAssets, recipientWithOptionalInlineDatum, redeemValueWithInlineScript, redeemValueWithRequiredReferenceScript, resolveExactWalletInputUtxos, resolveReferenceScript, runStateForwarding, setupTransaction, validateForwardedStateDatum, withStage } from "./internals";
import { formatConsolidationPreview } from "./preview-copy";
import { buildSttSpendRedeemerData, buildWalletSpendRedeemerData, resolveStructuredOnChainAction } from "@/lib/contracts/action-data";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { getWalletSpendScript, resolveWalletContinuingOutputAddressFromState, resolveWalletSpendScriptHash } from "@/lib/contracts/blueprint";
import { type BuildResult, type ConsolidateUtxosFormInput, type ContractConfig } from "@/lib/types/contracts";
import { type TxFetcher, type WalletSource } from "@/lib/mesh/tx-context";

const i18n = createDefaultTranslator("LibMeshTransactionsSttSpend", defaultMessages);

export async function buildConsolidateUtxosTx(
  wallet: WalletSource,
  config: ContractConfig,
  input: ConsolidateUtxosFormInput | PreparationConsolidateInput,
  txFetcher?: TxFetcher
): Promise<BuildResult> {
  const preparation = "beneficiaryPreparation" in input && input.beneficiaryPreparation === true ? input : null;
  const ordinary = preparation ? null : input as ConsolidateUtxosFormInput;
  if (preparation) validateBeneficiaryPreparationInput(preparation);
  const onChainAction = resolveStructuredOnChainAction(
    "consolidate-utxo",
    preparation ? "beneficiary" : ordinary!.authorityPath
  );
  const stateForwarding = createStateForwarding(config);
  const sttParams = stateForwarding.params;

  if (input.walletInputs.length < 1) {
    throw new Error("Consolidation requires at least one wallet script input.");
  }

  if (ordinary) {
    assertValidConstrData(ordinary.outputDatum, "Consolidated STT output datum");
    assertValidAssetList(ordinary.outputAssets, "Consolidated STT output assets");
    assertValidWalletInputRefs(
      input.walletInputs,
      "Consolidated wallet inputs"
    );
    assertValidWalletOutputs(
      ordinary.walletOutputs ?? [],
      "Consolidated wallet outputs"
    );
  }
  ensureUniqueWalletInputRefs(input.walletInputs);
  let forwardedDatum = ordinary ? unwrapStateDatum(ordinary.outputDatum, "STT state datum") : undefined;
  const forwardedStateWarnings = forwardedDatum ? validateForwardedStateDatum(
    forwardedDatum,
    onChainAction,
    "consolidate-utxo:validateStateDatum",
    "Consolidated STT output datum is invalid."
  ) : [];
  const walletScript = getWalletSpendScript({
    sttPolicyId: sttParams.sttPolicyId,
    sttAssetNameHex: sttParams.sttAssetNameHex
  });
  // Continuing wallet outputs follow the State's `intended_stake_credential`:
  // a staking (Some) wallet keeps its funds at the base address; a `None` wallet
  // resolves to the exact historical enterprise address (no behaviour change).
  let walletAddress = ordinary ? resolveWalletContinuingOutputAddressFromState({
    sttPolicyId: sttParams.sttPolicyId,
    sttAssetNameHex: sttParams.sttAssetNameHex,
    stateDatum: ordinary.outputDatum
  }) : "";
  const walletPaymentScriptHash = resolveWalletSpendScriptHash({
    sttPolicyId: sttParams.sttPolicyId,
    sttAssetNameHex: sttParams.sttAssetNameHex
  });
  const referenceTime = Date.now();
  const prepared = await buildTransactionWithReestimatedLimits(
    "consolidate-utxo:tx.draft-build",
    "consolidate-utxo:tx.build",
    async (overrides) => {
      const { tx, fetcher, changeAddress, setupDiagnostics } = await setupTransaction(wallet, referenceTime, txFetcher);
      addExtraRequiredSigners(tx, changeAddress, input.requiredSignerKeyHashes);
      const spendValidatorsByRef = new Map<string, string>();
      let walletOutputCount = 0;
      let migratesAddress = false;
      let preparationOutputs: ConsolidateUtxosFormInput["walletOutputs"];
      let preparationEvidence: PreparationOutputEvidence | undefined;
      const forwarding = await runStateForwarding({
        definition: stateForwarding,
        fetcher,
        tx,
        input: {
          txHash: input.sttInputTxHash,
          outputIndex: input.sttInputOutputIndex,
          stage: "consolidate-utxo:fetchSttUtxos",
          details: setupDiagnostics
        },
        reference: {
          stage: "consolidate-utxo:resolveSharedSttReferenceScript",
          details: setupDiagnostics,
          excludedRefs: input.walletInputs.map((walletInput) =>
            createInputRefKey(walletInput.txHash, walletInput.outputIndex)
          )
        },
        spendValidatorsByRef,
        afterInput: async () =>
          withStage(
            "consolidate-utxo:resolveWalletInputs",
            async () =>
              resolveExactWalletInputUtxos(
                fetcher,
                input.walletInputs,
                walletPaymentScriptHash,
                Boolean(preparation)
              ),
            { ...setupDiagnostics, walletAddress, walletPaymentScriptHash }
          ),
        beforeRedeem: async ({ resolved, value: walletInputs }) => {
          if (preparation) {
            const protocolParams = (tx.txBuilder as RuntimeTxBuilder)._protocolParams;
            if (!protocolParams) throw new Error("Recovery preparation requires live protocol parameters.");
            const planned = resolveBeneficiaryPreparation(preparation, resolved.input, walletInputs, changeAddress, protocolParams, referenceTime, sttParams);
            forwardedDatum = planned.state;
            walletAddress = planned.walletAddress;
            preparationOutputs = planned.plan.walletOutputs;
            preparationEvidence = {
              stateInput: resolved.input, walletInputs, stateDatum: planned.state,
              walletAddress, walletOutputs: preparationOutputs, changeAddress
            };
          }
          const consumedInputRefs = [
            resolved.inputRef,
            ...walletInputs.map((walletInput) =>
              createInputRefKey(
                walletInput.input.txHash,
                walletInput.input.outputIndex
              )
            )
          ];
          const walletSpendReference = await resolveReferenceScript(fetcher, {
            label: "Wallet spend",
            configuredReference: config.walletSpendReference,
            script: walletScript,
            stage: "consolidate-utxo:resolveWalletReferenceScript",
            details: { ...setupDiagnostics, walletAddress, walletPaymentScriptHash },
            excludedRefs: consumedInputRefs
          });

          return {
            redeemer: buildSttSpendRedeemerData(onChainAction),
            budget: overrides?.spendBudgetsByRef.get(resolved.inputRef),
            additionalWitnesses: [
              {
                label: "Wallet spend",
                script: walletScript,
                reference: walletSpendReference
              }
            ],
            afterRedeem: () => {
              for (const walletInput of walletInputs) {
                const inputRef = createInputRefKey(
                  walletInput.input.txHash,
                  walletInput.input.outputIndex
                );
                spendValidatorsByRef.set(inputRef, WALLET_SPEND_VALIDATOR);
                const redeemer = {
                  data: buildWalletSpendRedeemerData(onChainAction),
                  budget: overrides?.spendBudgetsByRef.get(inputRef)
                };
                if (walletSpendReference) {
                  redeemValueWithRequiredReferenceScript(
                    tx,
                    walletInput,
                    walletSpendReference,
                    redeemer
                  );
                } else {
                  redeemValueWithInlineScript(tx, walletInput, walletScript, redeemer);
                }
              }
            },
            createOutput: () => ({
              assets: preparation ? resolved.input.output.amount : mergeRestrictedSttAssets(
                ordinary!.outputAssets,
                resolved.input.output.amount,
                "consolidate-utxo"
              ),
              datum: forwardedDatum!
            }),
            afterOutput: () => {
              const walletOutputs =
                preparationOutputs ?? (ordinary!.walletOutputs && ordinary!.walletOutputs.length > 0
                  ? ordinary!.walletOutputs
                  : [
                      {
                        amount: mergeAssetLists(
                          walletInputs.map((walletInput) => walletInput.output.amount)
                        )
                      }
                    ]);

              walletOutputCount = walletOutputs.length;
              migratesAddress = assertValidConsolidationLayout(
                walletInputs,
                walletAddress
              ).migratesAddress;

              for (const walletOutput of walletOutputs) {
                tx.sendAssets(
                  recipientWithOptionalInlineDatum(walletAddress, walletOutput.inlineDatum),
                  walletOutput.amount
                );
              }
            }
          };
        }
      });
      const walletInputs = forwarding.value;

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          ...forwarding.diagnostics,
          walletAddress,
          sttInputTxHash: input.sttInputTxHash,
          sttInputOutputIndex: input.sttInputOutputIndex,
          walletInputs: input.walletInputs,
          walletOutputCount,
          migratesAddress
        },
        preservePreparedOutputs: Boolean(preparation),
        executionLabels: {
          mintValidators: [],
          rewardValidators: [],
          spendValidatorsByRef
        },
        context: {
          preparationEvidence,
          walletInputCount: walletInputs.length,
          walletOutputCount,
          migratesAddress,
          warnings: preparation ? [i18n("beneficiaryExitExternalFees")] : forwardedStateWarnings,
          referenceScriptUsage: forwarding.referenceScriptUsage
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
      : ordinary?.walletOutputs?.length ?? 1;
  const referenceScriptUsage =
    typeof prepared.context?.referenceScriptUsage === "string"
      ? prepared.context.referenceScriptUsage
      : "";

  if (preparation) {
    assertBeneficiaryPreparationOutputs(prepared.txHex, prepared.context.preparationEvidence as PreparationOutputEvidence);
  }
  return {
    txHex: prepared.txHex,
    preview: createTxPreview(
      "consolidate-utxo",
      formatConsolidationPreview(walletInputCount, walletOutputCount, referenceScriptUsage),
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    signerAddress: prepared.signerAddress,
    executionUnits: prepared.executionUnits,
    warnings: Array.isArray(prepared.context?.warnings)
      ? (prepared.context.warnings as string[])
      : undefined
  };
}
