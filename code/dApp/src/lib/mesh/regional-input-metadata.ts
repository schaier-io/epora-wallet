import { createHash } from "node:crypto";
import { getCache, waitUntil } from "@vercel/functions";
import type { BlockfrostProvider } from "@meshsdk/core";
import type { UTxO } from "@meshsdk/common";
import { CARDANO_NETWORK, type CardanoNetwork } from "@/lib/cardano-network";
import { getServerEnv, type ServerEnv } from "@/lib/env/server-env";
import { MESH_READ_TIMEOUT_MS } from "./read-retry";
import { immutableOutputs } from "./immutable-output-metadata";
import { fetchTxUtxosStrict } from "./blockfrost-reads";

export const REGIONAL_METADATA_TTL_SECONDS = 60;
export const REGIONAL_METADATA_DEADLINE_MS = 100;
export const MAX_REGIONAL_METADATA_BYTES = 256 * 1024;
const CACHE_NAMESPACE = "tx-input-metadata-v1";
const MAX_PENDING_METADATA_READS = 128;
const pendingReads = new WeakMap<BlockfrostProvider, Map<string, { promise: Promise<UTxO[]>; expiresAt: number }>>();

function scopedKey(hash: string, index: number | undefined, network: CardanoNetwork, env: ServerEnv) {
  const credential = { preprod: env.BLOCKFROST_PREPROD_PROJECT_ID, preview: env.BLOCKFROST_PREVIEW_PROJECT_ID, mainnet: env.BLOCKFROST_MAINNET_PROJECT_ID }[network];
  if (env.VERCEL !== "1" || !env.VERCEL_PROJECT_ID || !["preview", "production"].includes(env.VERCEL_ENV ?? "") || !credential?.startsWith(network)) return undefined;
  const fingerprint = createHash("sha256").update(credential).digest("hex");
  // Outputs are immutable. Schema changes get a new namespace; deployments share compatible entries.
  return JSON.stringify([env.VERCEL_PROJECT_ID, env.VERCEL_ENV, network, fingerprint, hash, index]);
}

async function bounded<T>(read: () => Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(read).catch(() => undefined),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), REGIONAL_METADATA_DEADLINE_MS); })
    ]);
  } finally { clearTimeout(timer); }
}

function cacheable(value: unknown, hash: string, index?: number) {
  const clean = immutableOutputs(value, hash, index);
  return clean && Buffer.byteLength(JSON.stringify(clean), "utf8") <= MAX_REGIONAL_METADATA_BYTES ? clean : undefined;
}

/** Only trusted provider output reads populate this cache. Status and caller evaluation context never enter it. */
export async function readRegionalInputMetadata(
  provider: BlockfrostProvider, hash: string, index?: number,
  network: CardanoNetwork = CARDANO_NETWORK, env: ServerEnv = getServerEnv()
): Promise<UTxO[]> {
  if (!/^[a-fA-F0-9]{64}$/.test(hash) || (index !== undefined && (!Number.isSafeInteger(index) || index < 0))) return fetchTxUtxosStrict(provider, hash, index);
  const normalized = hash.toLowerCase();
  const key = scopedKey(normalized, index, network, env);
  if (!key) return fetchTxUtxosStrict(provider, hash, index);
  let reads = pendingReads.get(provider);
  if (!reads) { reads = new Map(); pendingReads.set(provider, reads); }
  const entry = reads.get(key);
  let pending = entry && entry.expiresAt > Date.now() ? entry.promise : undefined;
  if (!pending) {
    const owner = reads;
    pending = (async () => {
      let cache: ReturnType<typeof getCache>;
      try { cache = getCache({ namespace: CACHE_NAMESPACE, keyHashFunction: key => createHash("sha256").update(key).digest("hex") }); }
      catch { return fetchTxUtxosStrict(provider, hash, index); }
      const cached = cacheable(await bounded(() => cache.get(key)), normalized, index);
      if (cached) return cached;
      const value = await fetchTxUtxosStrict(provider, hash, index);
      const clean = cacheable(value, normalized, index);
      if (clean) {
        const write = bounded(() => cache.set(key, clean, { ttl: REGIONAL_METADATA_TTL_SECONDS })).then(() => undefined);
        // Cache writes cannot delay or fail a transaction build.
        try { waitUntil(write); } catch { /* Outside an invocation, the bounded write still settles safely. */ }
      }
      return value;
    })();
    owner.set(key, { promise: pending, expiresAt: Date.now() + MESH_READ_TIMEOUT_MS });
    while (owner.size > MAX_PENDING_METADATA_READS) owner.delete(owner.keys().next().value!);
    const current = pending;
    void pending.then(() => { if (owner.get(key)?.promise === current) owner.delete(key); }, () => { if (owner.get(key)?.promise === current) owner.delete(key); });
  }
  return structuredClone(await pending);
}
