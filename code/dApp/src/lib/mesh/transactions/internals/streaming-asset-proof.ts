import type { UTxO } from "@meshsdk/core";
import type { ConstrData } from "@/lib/types/contracts";
import { resolveWalletContinuingOutputAddressFromState } from "@/lib/contracts/blueprint";
import { getFreshStreamingAssetUnits, getMissingStreamingAssetUnits } from "@/lib/contracts/streaming-asset-proof";
import { validateManagedStreamingPayments } from "@/lib/contracts/streaming-manage";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsStateValidation.json";
import type { setupTransaction } from "./core";
import type { RuntimeTxBuilder } from "./budget-runtime-builder";
import { decodeConstrDatumFromUtxo } from "./datum";
import { hasReferenceScript, excludeReservedUtxos } from "./reference-scripts";
import { addWalletInput, assertExactInputUnspent, createInputRefKey, dedupeUtxos } from "./utxo";

const i18n = createDefaultTranslator("LibContractsStateValidation", defaultMessages);
type ProofContext = Pick<Awaited<ReturnType<typeof setupTransaction>>,
  "tx" | "fetcher" | "walletUtxos" | "spendableWalletUtxos" | "reserveInputRef">;

/** Include evidence explicitly; a coin-selection candidate is not an input. */
export async function addStreamingAssetProof(context: ProofContext, options: {
  outputStateDatum: ConstrData;
  inputStateDatum?: ConstrData;
  includedUtxos: UTxO[];
  walletAddress?: string;
}) {
  const { tx, fetcher, walletUtxos, spendableWalletUtxos, reserveInputRef } = context;
  const required = getFreshStreamingAssetUnits(options.outputStateDatum, options.inputStateDatum);
  const evidence = [...options.includedUtxos];
  const missing = () => getMissingStreamingAssetUnits(required, evidence.flatMap((utxo) => utxo.output.amount));
  if (missing().length === 0) return;

  // Only discover smart-wallet funds when the connected wallet lacks evidence.
  // A failed discovery must not be reported as proof that an asset does not exist.
  const needsSmartWallet = getMissingStreamingAssetUnits(missing(), walletUtxos.flatMap((utxo) => utxo.output.amount)).length > 0;
  const smartWalletUtxos = needsSmartWallet && options.walletAddress
    ? await fetcher.fetchAddressUTxOs(options.walletAddress)
    : [];
  const referenceCandidates = dedupeUtxos([
    ...smartWalletUtxos,
    ...walletUtxos.filter(hasReferenceScript)
  ]);
  const includedRefs = new Set(evidence.map((utxo) => createInputRefKey(utxo.input.txHash, utxo.input.outputIndex)));
  const txBuilder = tx.txBuilder as RuntimeTxBuilder;

  for (const unit of required) {
    if (!missing().includes(unit)) continue;
    const containsAsset = (utxo: UTxO) =>
      getMissingStreamingAssetUnits([unit], utxo.output.amount).length === 0;
    const reference = referenceCandidates.find(containsAsset);
    const proof = reference ?? spendableWalletUtxos.find(containsAsset);
    if (!proof) throw new Error(i18n("streamingAssetProofRequired", { unit }));

    await assertExactInputUnspent(fetcher, proof.input, "Streaming asset proof", true);
    reserveInputRef(proof.input.txHash, proof.input.outputIndex);
    includedRefs.add(createInputRefKey(proof.input.txHash, proof.input.outputIndex));
    if (reference) {
      txBuilder.readOnlyTxInReference(proof.input.txHash, proof.input.outputIndex,
        proof.output.scriptRef ? proof.output.scriptRef.length / 2 : 0);
    } else {
      addWalletInput(txBuilder, proof);
    }
    evidence.push(proof);
  }
  // setupTransaction already supplied coin-selection candidates. Remove the
  // inputs that this proof has now included explicitly.
  txBuilder.selectUtxosFrom(excludeReservedUtxos(spendableWalletUtxos, includedRefs));
}

export async function prepareManagedStreamingPayments(context: ProofContext, options: {
  scriptInput: UTxO;
  referenceUtxo: UTxO;
  outputStateDatum: ConstrData;
  txLatestTimeMs: number;
  walletPaymentScriptHash: string;
  sttPolicyId: string;
  sttAssetNameHex: string;
}) {
  const inputStateDatum = decodeConstrDatumFromUtxo(options.scriptInput);
  if (!inputStateDatum) {
    throw new Error("Managing streaming payments requires an inline STT state datum on the selected input.");
  }
  const errors = validateManagedStreamingPayments(inputStateDatum, options.outputStateDatum,
    options.txLatestTimeMs, options.walletPaymentScriptHash, options.sttPolicyId);
  if (errors.length > 0) throw new Error(errors[0]);
  await addStreamingAssetProof(context, {
    inputStateDatum,
    outputStateDatum: options.outputStateDatum,
    includedUtxos: [options.scriptInput, options.referenceUtxo],
    walletAddress: resolveWalletContinuingOutputAddressFromState({
      sttPolicyId: options.sttPolicyId,
      sttAssetNameHex: options.sttAssetNameHex,
      stateDatum: inputStateDatum
    })
  });
}
