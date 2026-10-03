import { parseAssetUnit, type NativeScript, type UTxO } from "@meshsdk/common";
import { normalizePlutusScript, resolveNativeScriptHash, toScriptRef } from "@meshsdk/core-cst";
import { resolveScriptHash } from "@meshsdk/core";
import { z } from "zod";
import { meshHttpStatus } from "./http-error";
import { MESH_READ_TIMEOUT_MS } from "./read-retry";

type BlockfrostReader = { get(path: string): Promise<unknown> };
const PAGE_SIZE = 100;
const Hex = z.string().regex(/^(?:[0-9a-f]{2})+$/i);
const Hash28 = z.string().regex(/^[0-9a-f]{56}$/i);
const Hash32 = z.string().regex(/^[0-9a-f]{64}$/i);
const Quantity = z.string().regex(/^\d+$/);
const AssetUnit = z.string().regex(/^[0-9a-f]{56}(?:[0-9a-f]{2}){0,32}$/i);
const Amount = z.array(z.object({
  unit: z.union([z.literal("lovelace"), AssetUnit]),
  quantity: Quantity
})).min(1);

// Wire fields follow blockfrost-openapi/src/schemas/addresses/address_utxo_content.yaml.
const Output = z.object({
  address: z.string().min(1),
  output_index: z.number().int().nonnegative().safe(),
  amount: Amount,
  data_hash: Hash32.nullable(),
  inline_datum: Hex.nullable(),
  reference_script_hash: Hash28.nullable()
});
const UtxoPage = z.array(Output.extend({ tx_hash: Hash32 })).max(PAGE_SIZE);
const TransactionOutputs = z.object({ outputs: z.array(Output) });
const AddressPage = z.array(z.object({
  address: z.string().min(1), quantity: Quantity
})).max(PAGE_SIZE);
const CollectionPage = z.array(z.object({
  asset: AssetUnit, quantity: Quantity
})).max(PAGE_SIZE);

const Slot = z.union([Quantity, z.number().int().nonnegative().safe()]).transform(String);
const NativeScriptSchema: z.ZodType<NativeScript> = z.lazy(() => z.discriminatedUnion("type", [
  z.object({ type: z.literal("sig"), keyHash: Hash28 }),
  z.object({ type: z.literal("before"), slot: Slot }),
  z.object({ type: z.literal("after"), slot: Slot }),
  z.object({ type: z.literal("all"), scripts: z.array(NativeScriptSchema) }),
  z.object({ type: z.literal("any"), scripts: z.array(NativeScriptSchema) }),
  z.object({ type: z.literal("atLeast"), required: z.number().int().nonnegative().safe(), scripts: z.array(NativeScriptSchema) })
]));
const ScriptInfo = z.object({ type: z.enum(["timelock", "plutusV1", "plutusV2", "plutusV3"]) });
const ScriptCbor = z.object({ cbor: Hex });
const ScriptJson = z.object({ json: NativeScriptSchema });

export class BlockfrostResponseError extends Error {
  readonly status = 502;
  constructor(path: string, cause: unknown) {
    super(`Blockfrost returned an invalid response for ${path}.`, { cause });
    this.name = "BlockfrostResponseError";
  }
}

function parseResponse<T>(schema: z.ZodType<T>, raw: unknown, path: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new BlockfrostResponseError(path, parsed.error);
  return parsed.data;
}

async function readPage<T>(provider: BlockfrostReader, path: string, schema: z.ZodType<T[]>): Promise<T[]> {
  let raw: unknown;
  try {
    raw = await provider.get(path);
  } catch (error) {
    if (meshHttpStatus(error) === 404) return [];
    throw error;
  }
  return parseResponse(schema, raw, path);
}

async function readScriptRef(provider: BlockfrostReader, hash: string): Promise<string> {
  const path = `/scripts/${hash}`;
  const { type } = parseResponse(ScriptInfo, await provider.get(path), path);
  let script: NativeScript | { version: "V1" | "V2" | "V3"; code: string };
  if (type === "timelock") {
    script = parseResponse(ScriptJson, await provider.get(`${path}/json`), `${path}/json`).json;
  } else {
    const { cbor } = parseResponse(ScriptCbor, await provider.get(`${path}/cbor`), `${path}/cbor`);
    const versions = { plutusV1: "V1", plutusV2: "V2", plutusV3: "V3" } as const;
    try {
      script = { version: versions[type], code: normalizePlutusScript(cbor, "DoubleCBOR") };
    } catch (error) {
      throw new BlockfrostResponseError(`${path}/cbor`, error);
    }
  }
  try {
    const reference = toScriptRef(script);
    const actualHash = "version" in script ? resolveScriptHash(script.code, script.version) : resolveNativeScriptHash(script);
    if (actualHash !== hash.toLowerCase()) {
      throw new Error("Reference script hash does not match its content.");
    }
    return String(reference.toCbor());
  } catch (error) {
    throw new BlockfrostResponseError(path, error);
  }
}

export const MAX_SCRIPT_CACHE_ENTRIES = 128;
export const SCRIPT_CACHE_TTL_MS = 60_000;
const SCRIPT_READ_CONCURRENCY = 8;
type ScriptEntry = { promise: Promise<string>; expiresAt: number };
const scriptCaches = new WeakMap<BlockfrostReader, Map<string, ScriptEntry>>();

function readCachedScriptRef(provider: BlockfrostReader, hash: string): Promise<string> {
  const normalized = hash.toLowerCase();
  let cache = scriptCaches.get(provider);
  if (!cache) { cache = new Map(); scriptCaches.set(provider, cache); }
  let entry = cache.get(normalized);
  if (!entry || entry.expiresAt <= Date.now()) {
    const owner = cache;
    const current: ScriptEntry = {
      expiresAt: Date.now() + MESH_READ_TIMEOUT_MS,
      promise: Promise.resolve().then(() => readScriptRef(provider, normalized))
    };
    owner.delete(normalized);
    owner.set(normalized, current);
    while (owner.size > MAX_SCRIPT_CACHE_ENTRIES) owner.delete(owner.keys().next().value!);
    void current.promise.then(() => {
      if (owner.get(normalized) === current) current.expiresAt = Date.now() + SCRIPT_CACHE_TTL_MS;
    }, () => { if (owner.get(normalized) === current) owner.delete(normalized); });
    entry = current;
  }
  return entry.promise;
}

async function hydrateOutputs(provider: BlockfrostReader, rows: Array<z.infer<typeof Output> & { tx_hash: string }>): Promise<UTxO[]> {
  const utxos: UTxO[] = [];
  for (let start = 0; start < rows.length; start += SCRIPT_READ_CONCURRENCY) {
    utxos.push(...await Promise.all(rows.slice(start, start + SCRIPT_READ_CONCURRENCY).map(async row => ({
      input: { txHash: row.tx_hash, outputIndex: row.output_index },
      output: {
        address: row.address, amount: row.amount,
        dataHash: row.data_hash ?? undefined, plutusData: row.inline_datum ?? undefined,
        scriptHash: row.reference_script_hash ?? undefined,
        scriptRef: row.reference_script_hash ? await readCachedScriptRef(provider, row.reference_script_hash) : undefined
      }
    }))));
  }
  return utxos;
}

/** Filter before hydration so unrelated transaction outputs cause no script reads. */
export async function fetchTxUtxosStrict(provider: BlockfrostReader, hash: string, index?: number): Promise<UTxO[]> {
  const path = `txs/${encodeURIComponent(hash)}/utxos`;
  const { outputs } = parseResponse(TransactionOutputs, await provider.get(path), path);
  const selected = index === undefined ? outputs : outputs.filter(output => output.output_index === index);
  return hydrateOutputs(provider, selected.map(output => ({ ...output, tx_hash: hash.toLowerCase() })));
}

export async function fetchAddressUtxosStrict(provider: BlockfrostReader, address: string, asset?: string): Promise<UTxO[]> {
  const path = `/addresses/${encodeURIComponent(address)}/utxos${asset ? `/${encodeURIComponent(asset)}` : ""}`;
  const utxos: UTxO[] = [];
  for (let page = 1; ; page += 1) {
    const rows = await readPage(provider, `${path}?count=${PAGE_SIZE}&page=${page}&order=asc`, UtxoPage);
    utxos.push(...await hydrateOutputs(provider, rows));
    if (rows.length < PAGE_SIZE) return utxos;
  }
}

export async function fetchAssetAddressesStrict(provider: BlockfrostReader, asset: string) {
  const { policyId, assetName } = parseAssetUnit(asset);
  const path = `/assets/${encodeURIComponent(`${policyId}${assetName}`)}/addresses`;
  const addresses: Array<z.infer<typeof AddressPage>[number]> = [];
  for (let page = 1; ; page += 1) {
    const rows = await readPage(provider, `${path}?count=${PAGE_SIZE}&page=${page}&order=asc`, AddressPage);
    addresses.push(...rows);
    if (rows.length < PAGE_SIZE) return addresses;
  }
}

export async function fetchCollectionAssetsStrict(provider: BlockfrostReader, policyId: string, cursor = 1) {
  const path = `/assets/policy/${encodeURIComponent(policyId)}?count=${PAGE_SIZE}&page=${cursor}&order=asc`;
  const rows = await readPage(provider, path, CollectionPage);
  return {
    assets: rows.map(({ asset, quantity }) => ({ unit: asset, quantity })),
    next: rows.length === PAGE_SIZE ? cursor + 1 : null
  };
}
