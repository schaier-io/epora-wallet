import type { UTxO } from "@meshsdk/common";
import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { deserializeTx, type CstCollection, type CstTransactionInput } from "@/lib/mesh/cst";
import type { TxFetcher } from "@/lib/mesh/tx-context";
import { CARDANO_MAX_TX_SIZE_BYTES } from "./constants";
import { isRecord } from "./guards";
import { evaluateInWorker } from "./local-evaluation-worker";
import { resolveRawCostModelList } from "./script-data";

const MAX_LOCAL_INPUTS = 64;
const INPUT_READ_CONCURRENCY = 8;
const PROTOCOL_PARAMETERS_PATH = "epochs/latest/parameters";

export async function evaluateDraftLocally(fetcher: TxFetcher, txHex: string, provided: UTxO[] = []) {
  fetcher.signal?.throwIfAborted();
  if (txHex.length > CARDANO_MAX_TX_SIZE_BYTES * 2) throw new Error("Transaction exceeds local evaluation size limit.");
  const tx = deserializeTx(txHex);
  const body = tx.body();
  const inputs = body.inputs() as CstCollection<CstTransactionInput>;
  const refs = [...inputs.values(), ...(body.collateral()?.values() ?? []), ...(body.referenceInputs()?.values() ?? [])];
  if (refs.length > MAX_LOCAL_INPUTS) throw new Error("Transaction exceeds local evaluation input limit.");
  const key = (hash: string, index: number) => `${hash.toLowerCase()}#${index}`;
  const required = new Map(refs.map(ref => [key(ref.transactionId().toString(), Number(ref.index())), ref]));
  const outputs = new Map(provided.map(utxo => [key(utxo.input.txHash, utxo.input.outputIndex), utxo]));
  const resolveInputs = async () => {
    const hashes = [...new Set([...required].filter(([id]) => !outputs.has(id)).map(([, ref]) => ref.transactionId().toString()))];
    for (let start = 0; start < hashes.length; start += INPUT_READ_CONCURRENCY) {
      fetcher.signal?.throwIfAborted();
      const fetched = await Promise.all(hashes.slice(start, start + INPUT_READ_CONCURRENCY).map(hash => fetcher.fetchUTxOs(hash)));
      for (const utxos of fetched) for (const utxo of utxos) outputs.set(key(utxo.input.txHash, utxo.input.outputIndex), utxo);
    }
    return [...required.keys()].map(id => {
      const output = outputs.get(id);
      if (!output) throw new Error("Local evaluation is missing an input output.");
      return output;
    });
  };
  const [raw, utxos] = await Promise.all([fetcher.get(PROTOCOL_PARAMETERS_PATH), resolveInputs()]);
  fetcher.signal?.throwIfAborted();
  if (!isRecord(raw)) throw new Error("Local evaluation requires live protocol parameters.");
  const containers = {
    cost_models_raw: isRecord(raw.cost_models_raw) ? raw.cost_models_raw : undefined,
    cost_models: isRecord(raw.cost_models) ? raw.cost_models : undefined
  };
  const costModels = (["PlutusV1", "PlutusV2", "PlutusV3"] as const).map(version => {
    const model = resolveRawCostModelList(containers, version);
    if (!model?.length || !model.every(Number.isSafeInteger)) throw new Error("Local evaluation requires complete live cost models.");
    return model;
  });
  const actions = await evaluateInWorker({ txHex, utxos, network: CARDANO_NETWORK, costModels }, fetcher.signal);
  fetcher.signal?.throwIfAborted();
  if (actions.length !== tx.witnessSet().redeemers()?.size()) throw new Error("Local evaluation returned incomplete budgets.");
  return actions;
}
