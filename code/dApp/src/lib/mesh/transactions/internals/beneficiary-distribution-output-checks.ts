import { deserializeAddress, serializeData } from "@meshsdk/core";
import { deserializeTx, type CstTransactionOutput } from "@/lib/mesh/cst";
import type { Asset, ConstrData, WalletInputRef } from "@/lib/types/contracts";
export type ExpectedDistributionOutput = {
  address: string;
  amount: Asset[];
  inlineDatum: ConstrData;
};

export type BeneficiaryDistributionEvidence = {
  outputs: ExpectedDistributionOutput[];
  changeAddress: string;
  sttInput: WalletInputRef;
  walletInput: WalletInputRef;
  walletPaymentScriptHash: string;
};

function inlineDatumCbor(output: CstTransactionOutput): string | undefined {
  const datum = output.datum()?.asInlineData?.() as {
    toCbor(): string;
  } | undefined;
  return datum?.toCbor();
}

/** Verify the balanced body against the payout plan before review. */
export function assertBeneficiaryDistributionOutputs(txHex: string, evidence: BeneficiaryDistributionEvidence): void {
  const body = deserializeTx(txHex).body();
  const outputs = body.outputs() as CstTransactionOutput[];
  const inputs = (body.inputs() as {
    values(): {
      transactionId(): {
        toString(): string;
      };
      index(): bigint;
    }[];
  }).values();
  for (const ref of [evidence.sttInput, evidence.walletInput]) {
    if (!inputs.some(input => input.transactionId().toString() === ref.txHash && Number(input.index()) === ref.outputIndex)) {
      throw new Error("Exact distribution lost a required consumed input.");
    }
  }
  const used = new Set<number>();
  for (const expected of evidence.outputs) {
    const tag = serializeData(expected.inlineDatum, "Mesh");
    const matches = outputs.flatMap((output, index) => inlineDatumCbor(output) === tag ? [index] : []);
    if (matches.length !== 1 || used.has(matches[0]!)) {
      throw new Error("Exact distribution requires one distinct output for every expected State or payout tag.");
    }
    const index = matches[0]!;
    used.add(index);
    const output = outputs[index]!;
    if (output.address().toBech32().toString() !== expected.address) {
      throw new Error("Exact distribution changed a configured full payout address.");
    }
    const native = new Map([...output.amount().multiasset()?.entries() ?? []].map(([unit, quantity]) => [unit.toString(), BigInt(quantity.toString())]));
    for (const asset of expected.amount) {
      if (asset.unit === "lovelace") {
        if (BigInt(output.amount().coin().toString()) < BigInt(asset.quantity)) {
          throw new Error("Exact distribution reduced a prepared ADA payout or State value.");
        }
      } else {
        if (native.get(asset.unit) !== BigInt(asset.quantity)) {
          throw new Error("Exact distribution changed an exact native-asset share.");
        }
        native.delete(asset.unit);
      }
    }
    if (native.size) {
      throw new Error("Exact distribution added an unplanned native asset to an output.");
    }
  }
  outputs.forEach((output, index) => {
    const address = output.address().toBech32().toString();
    if (deserializeAddress(address).scriptHash === evidence.walletPaymentScriptHash) {
      throw new Error("Exact distribution cannot create continuing wallet outputs, including a payout to the same wallet.");
    }
    if (!used.has(index) && (address !== evidence.changeAddress || output.datum() !== undefined)) {
      throw new Error("Exact distribution created an unplanned output instead of connected-wallet change.");
    }
  });
}
