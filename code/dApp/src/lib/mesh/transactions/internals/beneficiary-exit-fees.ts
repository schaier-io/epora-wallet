import type { Transaction } from "@meshsdk/core";
import { getPreparedOutputCount } from "./budget-overrides";
import type { RuntimeTxBuilder } from "./budget-runtime-builder";
import { getLovelaceQuantity } from "./value";
import { deserializeTx, type CstTransactionOutput } from "@/lib/mesh/cst";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibMeshTransactionsSttSpend.json";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";

const i18n = createDefaultTranslator("LibMeshTransactionsSttSpend", defaultMessages);

export type BeneficiaryExitFeeEvidence = {
  smartInputLovelace: string;
  outputs: { index: number; address: string; lovelace: string }[];
};

/** Capture the explicit allocation before Mesh selects external funding or rebalances fees. */
export function captureBeneficiaryExitFeeEvidence(
  tx: Transaction,
  smartInputLovelace: bigint
): BeneficiaryExitFeeEvidence {
  getPreparedOutputCount(tx);
  const outputs = (tx.txBuilder as RuntimeTxBuilder).meshTxBuilderBody.outputs ?? [];
  return {
    smartInputLovelace: smartInputLovelace.toString(),
    outputs: outputs.map((output, index) => ({
      index, address: output.address ?? "",
      lovelace: getLovelaceQuantity(output.amount).toString()
    }))
  };
}

/** Output reductions can redirect smart ADA to fees; external topups cannot cancel them. */
export function beneficiaryExitExternalFeeLowerBound(
  txHex: string,
  evidence: BeneficiaryExitFeeEvidence
): bigint | null {
  const body = deserializeTx(txHex).body();
  const outputs = body.outputs() as CstTransactionOutput[];
  if (!/^\d+$/.test(evidence.smartInputLovelace) || body.withdrawals()?.size || body.certs()?.values().length) return null;
  let allocated = 0n;
  let reductions = 0n;
  for (const [position, original] of evidence.outputs.entries()) {
    const output = outputs[original.index];
    if (original.index !== position || !/^\d+$/.test(original.lovelace) ||
      !output || output.address().toBech32().toString() !== original.address) return null;
    const lovelace = BigInt(original.lovelace);
    allocated += lovelace;
    const decrease = lovelace - BigInt(output.amount().coin().toString());
    if (decrease > 0n) reductions += decrease;
  }
  if (allocated < BigInt(evidence.smartInputLovelace)) return null;
  const lowerBound = BigInt(body.fee().toString()) - reductions;
  return lowerBound > 0n ? lowerBound : 0n;
}

export function beneficiaryExitFeeWarning(txHex: string, evidence: BeneficiaryExitFeeEvidence): string {
  const lowerBound = beneficiaryExitExternalFeeLowerBound(txHex, evidence);
  if (lowerBound === null || lowerBound === 0n) return i18n("beneficiaryExitFeeSourceUnknown");
  if (lowerBound === BigInt(deserializeTx(txHex).body().fee().toString())) return i18n("beneficiaryExitExternalFees");
  return i18n("beneficiaryExitPartialExternalFees", { amount: formatLovelaceAsAda(lowerBound) });
}
