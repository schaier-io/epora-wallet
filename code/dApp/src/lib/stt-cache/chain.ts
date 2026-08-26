import { z } from "zod";
import type { TransactionInfo, UTxO } from "@meshsdk/common";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import type { AddressTransactionPageEntry, SttChainClient } from "@/lib/stt-cache/types";

const AddressTransactionsSchema = z.array(
  z.object({
    tx_hash: z.string().min(1),
    tx_index: z.number().int().nonnegative(),
    block_height: z.number().int().nullable().optional(),
    block_time: z.number().int().nullable().optional()
  })
);

function normalizeAddressTransactionPageEntry(
  entry: z.infer<typeof AddressTransactionsSchema>[number]
): AddressTransactionPageEntry {
  return {
    txHash: entry.tx_hash,
    txIndex: entry.tx_index,
    blockHeight: entry.block_height ?? null,
    blockTime: entry.block_time ?? null
  };
}

function normalizeCollectionCursor(cursor: number | string | undefined) {
  if (typeof cursor === "number") {
    return cursor;
  }

  if (typeof cursor === "string") {
    const parsed = Number(cursor);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }

  return undefined;
}

/**
 * Blockfrost returns a transaction's UTxOs FLAT: each entry carries `address`, `amount`,
 * `tx_hash` and `output_index` at the top level. Mesh's `UTxO` is nested,
 * `{ input: { txHash, outputIndex }, output: { address, amount } }`, and its BlockfrostProvider
 * assigns the raw arrays straight through (`inputs: data.inputs, outputs: data.outputs`) while
 * declaring the result as `TransactionInfo`, whose `inputs`/`outputs` are typed `UTxO[]`.
 *
 * The two shapes do not match, so `utxo.output` was `undefined` for EVERY entry, not for a rare
 * one. `extractTouchedWalletUnits` trusted the declared type, threw on the first transaction of
 * the first sync, and the whole background sync aborted, which is why the cache held zero rows.
 *
 * VERIFIED against preprod, `GET /txs/{hash}/utxos`:
 *   inputs  entry keys: address, amount, collateral, data_hash, inline_datum, output_index,
 *                       reference, reference_script_hash, tx_hash
 *   outputs entry keys: address, amount, collateral, consumed_by_tx, data_hash, inline_datum,
 *                       output_index, reference_script_hash
 *   nested `output` present: false
 *
 * This is the same boundary, and the same reason, as `normalizeAddressTransactionPageEntry`
 * above: the provider hands back Blockfrost's wire shape and this module owes the rest of the
 * app the shape it declares.
 */
const AssetSchema = z.array(
  z.object({ unit: z.string().min(1), quantity: z.string().min(1) })
);

const FlatUtxoSchema = z.object({
  address: z.string().min(1),
  amount: AssetSchema,
  output_index: z.number().int().nonnegative(),
  tx_hash: z.string().min(1).optional(),
  data_hash: z.string().nullable().optional(),
  inline_datum: z.string().nullable().optional(),
  reference_script_hash: z.string().nullable().optional(),
  // Inputs only. An entry flagged either way is not an ordinary spend: see `isConsumedInput`.
  collateral: z.boolean().optional(),
  reference: z.boolean().optional()
});

type FlatUtxo = z.infer<typeof FlatUtxoSchema>;

/** True when the entry is already in Mesh's nested shape, so it needs no mapping. */
function isMeshUtxo(entry: unknown): entry is UTxO {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "output" in entry &&
    typeof (entry as { output?: unknown }).output === "object" &&
    (entry as { output: unknown }).output !== null
  );
}

/**
 * Whether an input entry was actually spent by this transaction.
 *
 * A `reference` input is read and never consumed, and a `collateral` input is consumed only when
 * the script fails. `extractTouchedWalletUnits` reads an input as "this wallet's state moved", so
 * counting either would record a wallet transition that never happened.
 */
function isConsumedInput(entry: FlatUtxo): boolean {
  return entry.reference !== true && entry.collateral !== true;
}

function toMeshUtxo(entry: FlatUtxo, fallbackTxHash: string): UTxO {
  return {
    // Outputs carry no `tx_hash` of their own: an output's transaction is the one it belongs to.
    input: { txHash: entry.tx_hash ?? fallbackTxHash, outputIndex: entry.output_index },
    output: {
      address: entry.address,
      amount: entry.amount,
      ...(entry.data_hash ? { dataHash: entry.data_hash } : {}),
      ...(entry.inline_datum ? { plutusData: entry.inline_datum } : {}),
      ...(entry.reference_script_hash ? { scriptHash: entry.reference_script_hash } : {})
    }
  };
}

function normalizeUtxoList(
  raw: readonly unknown[],
  fallbackTxHash: string,
  keepOnlyConsumed: boolean
): UTxO[] {
  const normalized: UTxO[] = [];
  for (const entry of raw) {
    if (isMeshUtxo(entry)) {
      normalized.push(entry);
      continue;
    }
    const flat = FlatUtxoSchema.parse(entry);
    if (keepOnlyConsumed && !isConsumedInput(flat)) {
      continue;
    }
    normalized.push(toMeshUtxo(flat, fallbackTxHash));
  }
  return normalized;
}

/** Give `TransactionInfo` the `inputs`/`outputs` shape its own type promises. */
export function normalizeTransactionInfoUtxos(info: TransactionInfo): TransactionInfo {
  return {
    ...info,
    inputs: normalizeUtxoList(info.inputs as readonly unknown[], info.hash, true),
    outputs: normalizeUtxoList(info.outputs as readonly unknown[], info.hash, false)
  };
}

export function createDefaultSttChainClient(): SttChainClient {
  const provider = getBlockfrostProvider();

  return {
    fetchCollectionAssets(policyId, cursor) {
      return provider.fetchCollectionAssets(policyId, normalizeCollectionCursor(cursor));
    },
    fetchAddressUTxOs(address, asset) {
      return provider.fetchAddressUTxOs(address, asset);
    },
    async fetchAddressTransactionsPage(address, page, order) {
      const raw: unknown = await provider.get(
        `/addresses/${address}/transactions?page=${page}&order=${order}`
      );
      const parsed = AddressTransactionsSchema.parse(raw);
      return parsed.map(normalizeAddressTransactionPageEntry);
    },
    async fetchTxInfo(hash) {
      return normalizeTransactionInfoUtxos(await provider.fetchTxInfo(hash));
    }
  };
}
