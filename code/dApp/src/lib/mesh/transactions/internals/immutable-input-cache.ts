import { immutableOutputs } from "@/lib/mesh/immutable-output-metadata";
import type { UTxO } from "@meshsdk/common";
import { CARDANO_NETWORK, type CardanoNetwork } from "@/lib/cardano-network";
import type { TxFetcher } from "@/lib/mesh/tx-context";

export const INPUT_METADATA_CACHE_MS = 60_000;
export const INPUT_METADATA_PENDING_MS = 15_000;
export const MAX_INPUT_METADATA_ENTRIES = 128;

type Entry = { expiresAt: number; promise: Promise<UTxO[]>; settled: boolean; ownsSignal: boolean };
const providerCaches = new WeakMap<object, Map<string, Entry>>();
/** Cache output content only. Spend status remains a separate live read. */
export async function readImmutableInputMetadata(
  fetcher: TxFetcher, hash: string, index?: number, network: CardanoNetwork = CARDANO_NETWORK
): Promise<UTxO[]> {
  fetcher.signal?.throwIfAborted();
  if (!/^[a-fA-F0-9]{64}$/.test(hash) || (index !== undefined && (!Number.isSafeInteger(index) || index < 0))) {
    return fetcher.fetchUTxOs(hash, index);
  }
  const normalizedHash = hash.toLowerCase();
  // Only transports that explicitly share a source share metadata across instances.
  const scope = fetcher.inputMetadataCacheScope ?? fetcher;
  let cache = providerCaches.get(scope);
  if (!cache) { cache = new Map(); providerCaches.set(scope, cache); }
  const key = JSON.stringify([network, normalizedHash, index]);
  let entry = cache.get(key);
  if (entry && (entry.expiresAt <= Date.now() || (!entry.settled && (fetcher.signal || entry.ownsSignal)))) entry = undefined;
  if (!entry) {
    const reads = cache;
    const created: Entry = {
      expiresAt: Date.now() + INPUT_METADATA_PENDING_MS, settled: false, ownsSignal: Boolean(fetcher.signal),
      promise: Promise.resolve().then(() => fetcher.fetchUTxOs(hash, index)).then(value => {
        fetcher.signal?.throwIfAborted();
        const clean = immutableOutputs(value, normalizedHash, index);
        if (!clean) {
          if (reads.get(key) === created) reads.delete(key);
          return structuredClone(value);
        }
        created.settled = true;
        created.expiresAt = Date.now() + INPUT_METADATA_CACHE_MS;
        return clean;
      }).catch((error: unknown) => {
        if (reads.get(key) === created) reads.delete(key);
        throw error;
      })
    };
    entry = created;
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > MAX_INPUT_METADATA_ENTRIES) cache.delete(cache.keys().next().value!);
  }
  const result = await entry.promise;
  fetcher.signal?.throwIfAborted();
  return structuredClone(result);
}
