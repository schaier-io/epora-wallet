import { z } from "zod";
import type { TransactionInfo, UTxO } from "@meshsdk/common";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import { meshHttpStatus } from "@/lib/mesh/http-error";
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

// The address-page flow lists each UTxO together with the transaction that created
// it, so every entry must carry its `tx_hash`: the indexer persists
// `input.txHash` as the wallet's `currentTxHash`, and an entry without one would
// silently convert into an empty-hash UTxO through `toMeshUtxo`'s fallback. Reject
// the page instead. Only the tx-detail flow needs the fallback, for entries whose
// output genuinely has no `tx_hash` of its own.
const AddressUtxoEntrySchema = FlatUtxoSchema.extend({
  tx_hash: z.string().min(1)
});
const AddressUtxoPageSchema = z.array(AddressUtxoEntrySchema);

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

const PolicyAssetsSchema = z.array(
  z.object({ asset: z.string().min(1), quantity: z.string().min(1) })
);

// Blockfrost pages are 100 long; a shorter page is the last one.
const BLOCKFROST_PAGE_SIZE = 100;

/**
 * Blockfrost answers 404 for an address or policy it has never seen, which is
 * an empty result. Everything else (429, 5xx, a dropped connection) is a
 * failure and must reach the caller: Mesh's own `fetchAddressUTxOs` and
 * `fetchCollectionAssets` swallow every error into an empty list, and the
 * indexer reads an empty list as "the wallet is closed".
 */
async function getOrEmpty(
  provider: Pick<SttChainProvider, "get">,
  path: string
): Promise<unknown> {
  try {
    const raw: unknown = await provider.get(path);
    return raw;
  } catch (error) {
    if (meshHttpStatus(error) === 404) return [];
    throw error;
  }
}

export type SttChainProvider = {
  get: (url: string) => Promise<unknown>;
  fetchTxInfo: (hash: string) => Promise<TransactionInfo>;
};

export function createSttChainClient(provider: SttChainProvider): SttChainClient {
  return {
    async fetchCollectionAssets(policyId, cursor) {
      const page = normalizeCollectionCursor(cursor) ?? 1;
      const raw = await getOrEmpty(provider, `/assets/policy/${policyId}?page=${page}`);
      const parsed = PolicyAssetsSchema.parse(raw);
      return {
        assets: parsed.map((entry) => ({ unit: entry.asset, quantity: entry.quantity })),
        next: parsed.length === BLOCKFROST_PAGE_SIZE ? page + 1 : null
      };
    },
    async fetchAddressUTxOs(address, asset) {
      const path = `/addresses/${address}/utxos${asset ? `/${asset}` : ""}`;
      const utxos: UTxO[] = [];
      for (let page = 1; ; page += 1) {
        const entries = AddressUtxoPageSchema.parse(
          await getOrEmpty(provider, `${path}?page=${page}`)
        );
        for (const entry of entries) {
          // tx_hash is required by the page schema, so the fallback is unreachable.
          utxos.push(toMeshUtxo(entry, ""));
        }
        if (entries.length < BLOCKFROST_PAGE_SIZE) return utxos;
      }
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

export function createDefaultSttChainClient(): SttChainClient {
  return createSttChainClient(getBlockfrostProvider());
}
