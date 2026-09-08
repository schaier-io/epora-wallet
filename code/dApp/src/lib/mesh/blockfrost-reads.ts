import { parseAssetUnit, type NativeScript, type UTxO } from "@meshsdk/common";
import { normalizePlutusScript, toScriptRef } from "@meshsdk/core-cst";
import { z } from "zod";
import { meshHttpStatus } from "./http-error";

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
const UtxoPage = z.array(z.object({
  address: z.string().min(1),
  tx_hash: Hash32,
  output_index: z.number().int().nonnegative().safe(),
  amount: Amount,
  data_hash: Hash32.nullable(),
  inline_datum: Hex.nullable(),
  reference_script_hash: Hash28.nullable()
})).max(PAGE_SIZE);
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
    return String(toScriptRef(script).toCbor());
  } catch (error) {
    throw new BlockfrostResponseError(path, error);
  }
}

export async function fetchAddressUtxosStrict(provider: BlockfrostReader, address: string, asset?: string): Promise<UTxO[]> {
  const path = `/addresses/${encodeURIComponent(address)}/utxos${asset ? `/${encodeURIComponent(asset)}` : ""}`;
  const utxos: UTxO[] = [];
  const scripts = new Map<string, Promise<string>>();
  for (let page = 1; ; page += 1) {
    const rows = await readPage(provider, `${path}?count=${PAGE_SIZE}&page=${page}&order=asc`, UtxoPage);
    for (const row of rows) {
      let scriptRef: string | undefined;
      if (row.reference_script_hash) {
        const hash = row.reference_script_hash;
        const pending = scripts.get(hash) ?? readScriptRef(provider, hash);
        scripts.set(hash, pending);
        scriptRef = await pending;
      }
      utxos.push({
        input: { txHash: row.tx_hash, outputIndex: row.output_index },
        output: {
          address: row.address,
          amount: row.amount,
          dataHash: row.data_hash ?? undefined,
          plutusData: row.inline_datum ?? undefined,
          scriptHash: row.reference_script_hash ?? undefined,
          scriptRef
        }
      });
    }
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
