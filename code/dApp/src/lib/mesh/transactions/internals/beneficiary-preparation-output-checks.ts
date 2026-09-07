import { deserializeAddress, serializeData } from "@meshsdk/core";
import { deserializeTx, type CstTransactionOutput } from "@/lib/mesh/cst";
import type { Asset } from "@/lib/types/contracts";
import type { PreparationOutputEvidence } from "./beneficiary-preparation";
type PreparedOutput = CstTransactionOutput & {
  scriptRef(): unknown;
};
function amountMatches(output: CstTransactionOutput, amount: Asset[], allowExtraAda = false): boolean {
  const ada = BigInt(amount.find(asset => asset.unit === "lovelace")?.quantity ?? "0");
  const actualAda = BigInt(output.amount().coin().toString());
  if (allowExtraAda ? actualAda < ada : actualAda !== ada) {
    return false;
  }
  const native = new Map([...output.amount().multiasset()?.entries() ?? []].map(([unit, quantity]) => [unit.toString(), BigInt(quantity.toString())]));
  for (const asset of amount) {
    if (asset.unit === "lovelace" || BigInt(asset.quantity) === 0n) {
      continue;
    }
    if (native.get(asset.unit) !== BigInt(asset.quantity)) {
      return false;
    }
    native.delete(asset.unit);
  }
  return native.size === 0;
}
/** Check the actual balanced body. Wallet ADA cannot pay fees or receive an implicit topup. */
export function assertBeneficiaryPreparationOutputs(txHex: string, evidence: PreparationOutputEvidence): void {
  if (!evidence) {
    throw new Error("Recovery preparation has no balanced-output evidence.");
  }
  const body = deserializeTx(txHex).body();
  const inputs = (body.inputs() as {
    values(): {
      transactionId(): {
        toString(): string;
      };
      index(): bigint;
    }[];
  }).values();
  for (const utxo of [evidence.stateInput, ...evidence.walletInputs]) {
    if (!inputs.some(ref => ref.transactionId().toString() === utxo.input.txHash && Number(ref.index()) === utxo.input.outputIndex)) {
      throw new Error("Recovery preparation lost a selected State or wallet input.");
    }
  }
  const outputs = body.outputs() as PreparedOutput[];
  const walletHash = deserializeAddress(evidence.walletAddress).scriptHash;
  const stateHash = deserializeAddress(evidence.stateInput.output.address).scriptHash;
  const actualWallet = outputs.filter(output => deserializeAddress(output.address().toBech32().toString()).scriptHash === walletHash);
  if (actualWallet.length !== evidence.walletOutputs.length) {
    throw new Error("Recovery preparation changed its planned wallet output count.");
  }
  const unmatched = [...actualWallet];
  for (const expected of evidence.walletOutputs) {
    const index = unmatched.findIndex(output => output.address().toBech32().toString() === evidence.walletAddress &&
      output.datum() === undefined && output.scriptRef() === undefined && amountMatches(output, expected.amount));
    if (index < 0) {
      throw new Error("Recovery preparation changed a pool, remainder, full wallet address, or minimum-ADA allocation.");
    }
    unmatched.splice(index, 1);
  }
  const states = outputs.filter(output => deserializeAddress(output.address().toBech32().toString()).scriptHash === stateHash);
  const state = states[0];
  const datum = state?.datum()?.asInlineData?.() as {
    toCbor(): string;
  } | undefined;
  if (states.length !== 1 || !state || state.address().toBech32().toString() !== evidence.stateInput.output.address ||
    state.scriptRef() !== undefined || datum?.toCbor() !== serializeData(evidence.stateDatum, "Mesh") || !amountMatches(state, evidence.stateInput.output.amount, true)) {
    throw new Error("Recovery preparation changed the preserved State output.");
  }
  for (const output of outputs) {
    if (actualWallet.includes(output) || output === state) {
      continue;
    }
    if (output.address().toBech32().toString() !== evidence.changeAddress || output.datum() !== undefined || output.scriptRef() !== undefined) {
      throw new Error("Recovery preparation created an unplanned output instead of connected-wallet change.");
    }
  }
}
