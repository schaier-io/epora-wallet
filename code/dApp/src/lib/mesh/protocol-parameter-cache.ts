import { castProtocol, type Protocol } from "@meshsdk/common";
import type { BlockfrostProvider } from "@meshsdk/core";
import { z } from "zod";
import { MESH_READ_TIMEOUT_MS } from "./read-retry";

export const BUILD_PARAMETER_CACHE_MS = 5_000;
export const MAX_PARAMETER_CACHE_ENTRIES = 32;
const numeric = z.union([z.number().finite().nonnegative(), z.string().refine(value =>
  value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0
)]);
const RawParameters = z.object({
  epoch: z.number().int().nonnegative(),
  protocol_major_ver: z.number().int().nonnegative(),
  protocol_minor_ver: z.number().int().nonnegative(),
  coins_per_utxo_word: numeric.nullish(), collateral_percent: numeric.nullish(), decentralisation_param: numeric.nullish(),
  key_deposit: numeric.nullish(), max_block_ex_mem: numeric.nullish(), max_block_ex_steps: numeric.nullish(),
  max_block_header_size: numeric.nullish(), max_block_size: numeric.nullish(), max_collateral_inputs: numeric.nullish(),
  max_tx_ex_mem: numeric.nullish(), max_tx_ex_steps: numeric.nullish(), max_tx_size: numeric.nullish(), max_val_size: numeric.nullish(),
  min_fee_a: numeric.nullish(), min_fee_b: numeric.nullish(), min_pool_cost: numeric.nullish(), pool_deposit: numeric.nullish(),
  price_mem: numeric.nullish(), price_step: numeric.nullish(),
  cost_models_raw: z.record(z.string(), z.array(z.number().int()).min(1)).refine(models => Object.keys(models).length > 0)
}).passthrough();

type Snapshot = z.infer<typeof RawParameters>;

export function parseBuildParameters(raw: unknown): Snapshot {
  return RawParameters.parse(raw);
}
type Entry = { promise: Promise<Snapshot>; expiresAt: number };
const caches = new WeakMap<BlockfrostProvider, Map<string, Entry>>();

/** Provider identity separates network and credentials. Latest reads expire quickly. */
export async function readBuildParameters(provider: BlockfrostProvider, epoch?: number): Promise<Snapshot> {
  let cache = caches.get(provider);
  if (!cache) { cache = new Map(); caches.set(provider, cache); }
  const key = epoch === undefined ? "latest" : String(epoch);
  let entry = cache.get(key);
  if (!entry || Date.now() >= entry.expiresAt) {
    if (cache.size >= MAX_PARAMETER_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    const owner = cache;
    entry = { expiresAt: Date.now() + MESH_READ_TIMEOUT_MS, promise: Promise.resolve().then(async () => {
      const raw = parseBuildParameters(await provider.get(`epochs/${key}/parameters`));
      if (epoch !== undefined && raw.epoch !== epoch) throw new Error("Protocol parameter epoch does not match the request.");
      return raw;
    }) };
    const current = entry;
    cache.set(key, entry);
    void entry.promise.then(() => { current.expiresAt = Date.now() + BUILD_PARAMETER_CACHE_MS; }, () => {
      if (owner.get(key) === current) owner.delete(key);
    });
  }
  return structuredClone(await entry.promise);
}

/** Match the installed Blockfrost provider's field mapping and Mesh conversion. */
export function protocolFromBuildParameters(raw: Snapshot): Protocol {
  return castProtocol({
    coinsPerUtxoSize: raw.coins_per_utxo_word, collateralPercent: raw.collateral_percent,
    decentralisation: raw.decentralisation_param, epoch: raw.epoch, keyDeposit: raw.key_deposit,
    maxBlockExMem: raw.max_block_ex_mem, maxBlockExSteps: raw.max_block_ex_steps,
    maxBlockHeaderSize: raw.max_block_header_size, maxBlockSize: raw.max_block_size,
    maxCollateralInputs: raw.max_collateral_inputs, maxTxExMem: raw.max_tx_ex_mem,
    maxTxExSteps: raw.max_tx_ex_steps, maxTxSize: raw.max_tx_size, maxValSize: raw.max_val_size,
    minFeeA: raw.min_fee_a, minFeeB: raw.min_fee_b, minPoolCost: raw.min_pool_cost,
    poolDeposit: raw.pool_deposit, priceMem: raw.price_mem, priceStep: raw.price_step
  });
}
