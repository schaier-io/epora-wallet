// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockfrostProvider } from "@meshsdk/core";
import type * as BlockfrostServer from "./blockfrost-server";
import type * as BlockfrostReads from "./blockfrost-reads";
import type { ServerEnv } from "@/lib/env/server-env";
import { MESH_READ_TIMEOUT_MS } from "./read-retry";
import type { CardanoNetwork } from "@/lib/cardano-network";
import { readRegionalInputMetadata, REGIONAL_METADATA_DEADLINE_MS, MAX_REGIONAL_METADATA_BYTES } from "./regional-input-metadata";
import { executeMeshMethod } from "./blockfrost-server";
import { createServerTxFetcher } from "./server-wallet";

const hydration = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./blockfrost-reads", async original => ({
  ...await original<typeof BlockfrostReads>(),
  fetchTxUtxosStrict: hydration.read
}));
const cache = vi.hoisted(() => ({ values: new Map<string, unknown>(), get: vi.fn<(key: string) => Promise<unknown>>(), set: vi.fn<(key: string, value: unknown, options?: { ttl: number }) => Promise<void>>(), factory: vi.fn(), waitUntil: vi.fn<(pending: Promise<unknown>) => void>(), provider: undefined as unknown as BlockfrostProvider }));
vi.mock("@vercel/functions", () => ({ getCache: cache.factory, waitUntil: cache.waitUntil }));
vi.mock("./blockfrost-server", async original => ({ ...await original<typeof BlockfrostServer>(), getBlockfrostProvider: () => cache.provider }));
const HASH = "ab".repeat(32);
const env: ServerEnv = { VERCEL: "1", VERCEL_PROJECT_ID: "prj_fixture", VERCEL_ENV: "production", BLOCKFROST_PREPROD_PROJECT_ID: "preprod-fixture-key", BLOCKFROST_MAINNET_PROJECT_ID: "mainnet-fixture-key" };
function output() { return { input: { txHash: HASH, outputIndex: 0 }, output: { address: "addr_test_fixture", amount: [{ unit: "lovelace", quantity: "10000000" }], scriptRef: "abcd", plutusData: "d87980" } }; }
function provider(value = [output()]) {
  const source = { fetchUTxOs: vi.fn(async () => value), get: vi.fn(async () => ({ outputs: [{ consumed_by_tx: null }] })), evaluateTx: vi.fn(async () => []) };
  return { source, provider: source as unknown as BlockfrostProvider };
}
async function writes() { await Promise.all(cache.waitUntil.mock.calls.map(([pending]) => pending as Promise<unknown>)); }
beforeEach(() => {
  vi.clearAllMocks(); cache.values.clear();
  hydration.read.mockReset().mockImplementation((source: BlockfrostProvider, hash: string, index?: number) => source.fetchUTxOs(hash, index));
  cache.get.mockReset().mockImplementation(async key => cache.values.get(key));
  cache.set.mockReset().mockImplementation(async (key, value) => { cache.values.set(key, structuredClone(value)); });
  cache.factory.mockReset().mockReturnValue(cache);
  cache.waitUntil.mockReset();
});
afterEach(async () => { await writes(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("regional immutable input metadata", () => {
  it("filters transaction outputs before hydration through the trusted RPC path", async () => {
    const actual = await vi.importActual<typeof BlockfrostReads>("./blockfrost-reads");
    hydration.read.mockImplementation(actual.fetchTxUtxosStrict);
    const current = provider();
    current.source.get.mockResolvedValue({ outputs: [0, 1].map(output_index => ({
      address: "addr_test_fixture", output_index, amount: [{ unit: "lovelace", quantity: "10000000" }],
      data_hash: null, inline_datum: "d87980", reference_script_hash: output_index ? "ab".repeat(28) : null
    })) } as never);
    await expect(readRegionalInputMetadata(current.provider, HASH, 0, "preprod", {})).resolves.toEqual([
      { input: { txHash: HASH, outputIndex: 0 }, output: {
        address: "addr_test_fixture", amount: [{ unit: "lovelace", quantity: "10000000" }],
        dataHash: undefined, plutusData: "d87980", scriptHash: undefined, scriptRef: undefined
      } }
    ]);
    expect(current.source.get).toHaveBeenCalledExactlyOnceWith(`txs/${HASH}/utxos`);
    expect(current.source.fetchUTxOs).not.toHaveBeenCalled();
  });
  it("shares trusted output content across providers and deployments with clones and a TTL", async () => {
    const first = provider();
    const initial = await readRegionalInputMetadata(first.provider, HASH.toUpperCase(), 0, "preprod", env);
    await writes();
    const [key, stored, options] = cache.set.mock.calls[0]!;
    expect(key).not.toContain(env.BLOCKFROST_PREPROD_PROJECT_ID!);
    expect(options).toEqual({ ttl: 60 });
    expect(stored).toEqual([output()]);
    initial[0]!.output.amount[0]!.quantity = "0";
    const second = provider();
    const reused = await readRegionalInputMetadata(second.provider, HASH, 0, "preprod", env);
    expect(reused).toEqual([output()]);
    expect(first.source.fetchUTxOs).toHaveBeenCalledTimes(1);
    expect(second.source.fetchUTxOs).not.toHaveBeenCalled();
    expect((cache.factory.mock.calls[0]![0] as { namespace: string }).namespace).toBe("tx-input-metadata-v1");
  });

  it("hashes the full scoped key with SHA256 instead of colliding SDK defaults", async () => {
    const current = provider(); await readRegionalInputMetadata(current.provider, HASH, 0, "preprod", env);
    const options = cache.factory.mock.calls[0]![0] as { keyHashFunction?: (key: string) => string };
    expect(options.keyHashFunction).toBeTypeOf("function");
    const scoped = (reference: string) => JSON.stringify([env.VERCEL_PROJECT_ID, env.VERCEL_ENV, "preprod", createHash("sha256").update(env.BLOCKFROST_PREPROD_PROJECT_ID!).digest("hex"), reference, 0]);
    const first = scoped("f052004254b23fb8c0f8b1a5f5b45619e4744a50bad73458b88ca4d1ede10612");
    const second = scoped("ae63988fb7417bef30f3dde51bc33cdbf7129c66ab03599e784b039e6460886c");
    expect(options.keyHashFunction!(first)).toBe("49d08177cd80a86e37a1f0d544a3ac05d1cbb4326b7c5d7c49b41931166ae3c1");
    expect(options.keyHashFunction!(second)).toBe("371dc7bcb838d70b8cc45994d153b0b22bd30e044a47d4b510819f780f2cf520");
    expect(options.keyHashFunction!(cache.get.mock.calls[0]![0])).toMatch(/^[a-f0-9]{64}$/);
  });

  it("isolates project, environment, network, provider credentials, and output indices", async () => {
    for (const [network, settings, index] of [
      ["preprod", env, undefined], ["preprod", { ...env, VERCEL_PROJECT_ID: "another-project" }, undefined],
      ["preprod", { ...env, VERCEL_ENV: "preview" }, undefined], ["mainnet", env, undefined],
      ["preprod", { ...env, BLOCKFROST_PREPROD_PROJECT_ID: "preprod-other-key" }, undefined],
      ["preprod", env, 0]
    ] as const) {
      const current = provider(); await readRegionalInputMetadata(current.provider, HASH, index, network, settings); await writes();
      expect(current.source.fetchUTxOs).toHaveBeenCalledTimes(1);
    }
    expect(new Set(cache.set.mock.calls.map(([key]) => key)).size).toBe(6);
  });

  it.each([{}, { ...env, VERCEL: undefined }, { ...env, VERCEL_PROJECT_ID: undefined }, { ...env, VERCEL_ENV: "development" }, { ...env, BLOCKFROST_PREPROD_PROJECT_ID: "mainnet-wrong" }])("bypasses the regional cache when scope is incomplete: %j", async settings => {
    const current = provider(); await readRegionalInputMetadata(current.provider, HASH, 0, "preprod", settings);
    expect(cache.factory).not.toHaveBeenCalled(); expect(current.source.fetchUTxOs).toHaveBeenCalledTimes(1);
  });

  it("does not cache an unknown network", async () => {
    const current = provider(); await readRegionalInputMetadata(current.provider, HASH, 0, "unknown" as CardanoNetwork, env);
    expect(cache.factory).not.toHaveBeenCalled(); expect(current.source.fetchUTxOs).toHaveBeenCalledTimes(1);
  });

  it("expires hung pending provider reads so later requests can retry", async () => {
    vi.useFakeTimers(); const current = provider(); let release!: () => void;
    current.source.fetchUTxOs.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve([output()]); }));
    const hung = readRegionalInputMetadata(current.provider, HASH, 0, "preprod", env);
    await vi.advanceTimersByTimeAsync(MESH_READ_TIMEOUT_MS);
    const retried = readRegionalInputMetadata(current.provider, HASH, 0, "preprod", env);
    await vi.advanceTimersByTimeAsync(0);
    expect(await retried).toEqual([output()]); expect(current.source.fetchUTxOs).toHaveBeenCalledTimes(2);
    release(); expect(await hung).toEqual([output()]); await writes();
  });

  it("deduplicates concurrent same-provider reads and evicts failed reads", async () => {
    const current = provider(); let release!: () => void;
    current.source.fetchUTxOs.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve([output()]); }));
    const first = readRegionalInputMetadata(current.provider, HASH, 0, "preprod", env);
    const second = readRegionalInputMetadata(current.provider, HASH, 0, "preprod", env);
    await vi.waitFor(() => expect(current.source.fetchUTxOs).toHaveBeenCalledTimes(1)); release();
    expect(await first).toEqual(await second); await writes(); cache.values.clear();
    current.source.fetchUTxOs.mockRejectedValueOnce(new Error("provider failed"));
    await expect(readRegionalInputMetadata(current.provider, HASH, 0, "preprod", env)).rejects.toThrow("provider failed");
    await expect(readRegionalInputMetadata(current.provider, HASH, 0, "preprod", env)).resolves.toEqual([output()]);
  });

  it.each([null, [], [{ ...output(), input: { txHash: "cd".repeat(32), outputIndex: 0 } }], [{ ...output(), output: { ...output().output, amount: [{ unit: "lovelace", quantity: "bad" }] } }], [{ ...output(), output: { ...output().output, scriptRef: "a".repeat(MAX_REGIONAL_METADATA_BYTES) } }]].map(value => [value]))("treats invalid or oversized cache content as a miss", async value => {
    cache.get.mockResolvedValue(value); const current = provider();
    await expect(readRegionalInputMetadata(current.provider, HASH, 0, "preprod", env)).resolves.toEqual([output()]);
    expect(current.source.fetchUTxOs).toHaveBeenCalledTimes(1);
  });

  it.each([[], [{ ...output(), input: { txHash: "cd".repeat(32), outputIndex: 0 } }], [{ ...output(), output: { ...output().output, scriptRef: "a".repeat(MAX_REGIONAL_METADATA_BYTES) } }]].map(value => [value]))("does not write empty, malformed, or oversized provider results", async value => {
    const current = provider(value); await readRegionalInputMetadata(current.provider, HASH, 0, "preprod", env);
    expect(cache.set).not.toHaveBeenCalled(); expect(cache.waitUntil).not.toHaveBeenCalled();
  });

  it("falls back when cache creation or reads throw and returns data when writes fail", async () => {
    const current = provider(); cache.factory.mockImplementationOnce(() => { throw new Error("unavailable"); });
    expect(await readRegionalInputMetadata(current.provider, HASH, 0, "preprod", env)).toEqual([output()]);
    cache.get.mockRejectedValue(new Error("read failed")); cache.set.mockRejectedValue(new Error("write failed"));
    expect(await readRegionalInputMetadata(current.provider, HASH, 0, "preprod", env)).toEqual([output()]); await writes();
    expect(current.source.fetchUTxOs).toHaveBeenCalledTimes(2);
  });

  it("bounds slow cache reads and keeps slow writes off the build response", async () => {
    vi.useFakeTimers(); cache.get.mockImplementation(() => new Promise(() => {})); cache.set.mockImplementation(() => new Promise(() => {}));
    const current = provider(); const pending = readRegionalInputMetadata(current.provider, HASH, 0, "preprod", env);
    await vi.advanceTimersByTimeAsync(REGIONAL_METADATA_DEADLINE_MS);
    expect(await pending).toEqual([output()]); expect(cache.waitUntil).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(REGIONAL_METADATA_DEADLINE_MS); await writes();
  });

  it("serves both trusted RPC and build reads while status and evaluation remain uncached", async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const current = provider(); cache.provider = current.provider;
    await executeMeshMethod(current.provider, "fetchUTxOs", [HASH, 0]); await writes();
    const buildFetcher = createServerTxFetcher();
    expect(await buildFetcher.fetchUTxOs(HASH, 0)).toEqual([output()]);
    expect(current.source.fetchUTxOs).toHaveBeenCalledTimes(1);
    await executeMeshMethod(current.provider, "get", [`txs/${HASH}/utxos`]);
    await buildFetcher.get(`txs/${HASH}/utxos`);
    await executeMeshMethod(current.provider, "evaluateTx", ["80", [output()]]);
    expect(current.source.get).toHaveBeenCalledTimes(2);
    expect(current.source.evaluateTx).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });
});
