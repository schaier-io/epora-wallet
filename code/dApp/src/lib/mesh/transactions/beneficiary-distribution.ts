import { deserializeAddress } from "@meshsdk/core";
import type { BuildResult, ContractConfig, SttSpendFormInput } from "@/lib/types/contracts";
import type { WalletSource, TxFetcher } from "@/lib/mesh/tx-context";
import { deriveBeneficiaryDistributionStateDatum } from "@/lib/contracts/beneficiary-distribution";
import { buildSttSpendRedeemerData, buildWalletSpendRedeemerData } from "@/lib/contracts/action-data";
import { getWalletSpendScript, resolveWalletSpendScriptHash } from "@/lib/contracts/blueprint";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibMeshTransactionsSttSpend.json";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import { assertValidWalletInputRefs } from "./internals/guards";
import {
  assertBeneficiaryDistributionOutputs,
  type BeneficiaryDistributionEvidence,
  type ExpectedDistributionOutput
} from "./internals/beneficiary-distribution-output-checks";
import {
  WALLET_SPEND_VALIDATOR,
  addExtraRequiredSigners,
  buildTransactionWithReestimatedLimits,
  createInputRefKey,
  createStateForwarding,
  createTxPreview,
  decodeConstrDatumFromUtxo,
  getValidityWindow,
  redeemValueWithInlineScript,
  redeemValueWithRequiredReferenceScript,
  resolveReferenceScript,
  resolveExactWalletInputUtxos,
  runStateForwarding,
  setupTransaction
} from "./internals";
import { getLovelaceQuantity, sendAssetsWithOptionalInlineDatumAndReferenceScript } from "./internals/value";
const i18n = createDefaultTranslator("LibMeshTransactionsSttSpend", defaultMessages);
export function validateBeneficiaryDistributionInput(input: SttSpendFormInput): void {
  assertValidWalletInputRefs(input.walletInputs, "Exact distribution wallet input");
  if (input.walletInputs?.length !== 1) {
    throw new Error("Exact distribution requires exactly one selected wallet input.");
  }
  if (!input.beneficiarySignerKeyHash?.trim()) {
    throw new Error("Exact distribution requires the connected beneficiary payment key hash.");
  }
  if (input.outputDatum !== undefined || input.outputAssets !== undefined || input.walletOutputs?.length || input.extraTransfers?.length || input.authorityPath !== undefined) {
    throw new Error("Exact distribution derives all outputs and beneficiary authority. Caller outputs, transfers and authority overrides are not allowed.");
  }
}

export async function buildBeneficiaryDistributionTx(wallet: WalletSource, config: ContractConfig, input: SttSpendFormInput, txFetcher?: TxFetcher): Promise<BuildResult> {
  validateBeneficiaryDistributionInput(input);
  const definition = createStateForwarding(config);
  const walletScript = getWalletSpendScript(definition.params);
  const walletPaymentScriptHash = resolveWalletSpendScriptHash(definition.params);
  const referenceTime = input.validityWindowReferenceTimeMs ?? Date.now();
  const prepared = await buildTransactionWithReestimatedLimits("beneficiary-distribution:draft-build", "beneficiary-distribution:build", async (overrides) => {
    const { tx, fetcher, setupDiagnostics, signerAddress, changeAddress } = await setupTransaction(wallet, referenceTime, txFetcher);
    const connectedSigner = deserializeAddress(signerAddress).pubKeyHash;
    if (connectedSigner !== input.beneficiarySignerKeyHash!.trim().toLowerCase()) {
      throw new Error("Exact distribution beneficiary signer must match the connected wallet.");
    }
    addExtraRequiredSigners(tx, signerAddress, input.requiredSignerKeyHashes);
    const spendValidatorsByRef = new Map<string, string>();
    const outputs: ExpectedDistributionOutput[] = [];
    const warnings: string[] = [];
    let evidence: BeneficiaryDistributionEvidence | undefined;
    const forwarding = await runStateForwarding({
      definition,
      fetcher,
      tx,
      spendValidatorsByRef,
      input: {
        txHash: input.sttInputTxHash,
        outputIndex: input.sttInputOutputIndex,
        stage: "beneficiary-distribution:state"
      },
      reference: {
        stage: "beneficiary-distribution:reference",
        excludedRefs: input.walletInputs!.map(ref => createInputRefKey(ref.txHash, ref.outputIndex))
      },
      afterInput: async ({ input: resolved }) => {
        const stateDatum = decodeConstrDatumFromUtxo(resolved.input);
        if (!stateDatum) {
          throw new Error("Exact distribution requires an inline State datum.");
        }
        const [walletInput] = await resolveExactWalletInputUtxos(fetcher, input.walletInputs!, walletPaymentScriptHash);
        if (!walletInput) {
          throw new Error("Exact distribution wallet input is unavailable.");
        }
        const window = getValidityWindow(referenceTime);
        const computation = deriveBeneficiaryDistributionStateDatum({
          stateDatum,
          beneficiarySignerKeyHash: connectedSigner,
          walletInputAmount: walletInput.output.amount,
          sttInput: resolved.input.input,
          txEarliestTimeMs: window.earliestTimeMs,
          txLatestTimeMs: window.latestTimeMs
        });
        return {
          computation,
          walletInput
        };
      },
      beforeRedeem: async ({ resolved, value: { computation, walletInput } }) => {
        const action = {
          kind: "distribute-beneficiaries" as const,
          beneficiaryId: computation.beneficiaryId
        };
        const walletRef = createInputRefKey(walletInput.input.txHash, walletInput.input.outputIndex);
        spendValidatorsByRef.set(walletRef, WALLET_SPEND_VALIDATOR);
        const walletReference = await resolveReferenceScript(fetcher, {
          label: "Wallet spend",
          configuredReference: config.walletSpendReference,
          script: walletScript,
          stage: "beneficiary-distribution:wallet-reference",
          excludedRefs: [resolved.inputRef, walletRef]
        });
        const walletRedeemer = {
          data: buildWalletSpendRedeemerData(action),
          budget: overrides?.spendBudgetsByRef.get(walletRef)
        };
        if (walletReference) {
          redeemValueWithRequiredReferenceScript(tx, walletInput, walletReference, walletRedeemer);
        } else {
          redeemValueWithInlineScript(tx, walletInput, walletScript, walletRedeemer);
        }
        outputs.push({
          address: resolved.input.output.address,
          amount: resolved.input.output.amount.map(asset => ({ ...asset })),
          inlineDatum: computation.outputDatum
        });
        evidence = {
          outputs,
          changeAddress,
          sttInput: resolved.input.input,
          walletInput: walletInput.input,
          walletPaymentScriptHash
        };
        warnings.push(i18n("beneficiaryDistributionNotice", { count: computation.payouts.length }));
        return {
          assets: resolved.input.output.amount,
          datum: computation.outputDatum,
          redeemer: buildSttSpendRedeemerData(action),
          budget: overrides?.spendBudgetsByRef.get(resolved.inputRef),
          additionalWitnesses: [{
            label: "Wallet spend",
            script: walletScript,
            reference: walletReference
          }],
          afterOutput: () => {
            for (const payout of computation.payouts) {
              const output = sendAssetsWithOptionalInlineDatumAndReferenceScript(tx, payout.address, payout.amount, payout.inlineDatum);
              outputs.push({
                address: payout.address,
                amount: output.amount.map(asset => ({ ...asset })),
                inlineDatum: payout.inlineDatum
              });
              const settlement = getLovelaceQuantity(payout.amount);
              const finalAda = getLovelaceQuantity(output.amount);
              if (finalAda > settlement) {
                warnings.push(i18n("beneficiaryDistributionAdaTopUp", {
                  payoutTopUpAda: formatLovelaceAsAda(finalAda - settlement),
                  payoutAddress: payout.address,
                  finalOutputAda: formatLovelaceAsAda(finalAda),
                  settlementAda: formatLovelaceAsAda(settlement)
                }));
              }
            }
          }
        };
      }
    });
    return {
      tx,
      signerAddress,
      diagnostics: {
        ...setupDiagnostics,
        ...forwarding.diagnostics
      },
      preservePreparedOutputs: true,
      executionLabels: {
        mintValidators: [],
        rewardValidators: [],
        spendValidatorsByRef
      },
      context: {
        evidence,
        warnings
      }
    };
  }, txFetcher);
  const evidence = prepared.context.evidence as BeneficiaryDistributionEvidence;
  assertBeneficiaryDistributionOutputs(prepared.txHex, evidence);
  return {
    txHex: prepared.txHex,
    preview: createTxPreview("distribute-beneficiaries", i18n("beneficiaryDistributionSummary", { count: evidence.outputs.length - 1 }), prepared.txHex),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits,
    signerAddress: prepared.signerAddress,
    warnings: prepared.context.warnings as string[]
  };
}
