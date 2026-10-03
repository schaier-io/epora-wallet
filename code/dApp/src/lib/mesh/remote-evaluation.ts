import type { TxFetcher } from "./tx-context";
import { meshEvaluationOverlapRefs } from "./http-error";
import { isRecord } from "./transactions/internals/guards";

// Local evaluation needs all input metadata. Remote Ogmios evaluation rejects
// supplemental outputs it already knows. Preserve unknown inputs and chained
// transactions, and retry once after removing only the reported overlaps.
export async function evaluateRemoteTx(
  provider: Pick<TxFetcher, "evaluateTx">,
  ...[tx, additionalUtxos, additionalTxs]: Parameters<TxFetcher["evaluateTx"]>
): ReturnType<TxFetcher["evaluateTx"]> {
  try {
    return await provider.evaluateTx(tx, additionalUtxos, additionalTxs);
  } catch (error) {
    const overlaps = meshEvaluationOverlapRefs(error);
    if (!overlaps || !additionalUtxos?.length) throw error;
    const remaining = additionalUtxos.filter(utxo => {
      if (!isRecord(utxo) || !isRecord(utxo.input)) return true;
      const { txHash, outputIndex } = utxo.input;
      return typeof txHash !== "string" || typeof outputIndex !== "number" ||
        !overlaps.has(`${txHash.toLowerCase()}#${outputIndex}`);
    });
    if (remaining.length === additionalUtxos.length) throw error;
    return provider.evaluateTx(tx, remaining, additionalTxs);
  }
}
