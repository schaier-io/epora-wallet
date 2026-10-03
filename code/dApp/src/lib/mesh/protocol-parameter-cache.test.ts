import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import type { BlockfrostProvider } from "@meshsdk/core";
import { MESH_READ_TIMEOUT_MS } from "./read-retry";
import { executeMeshMethod } from "./blockfrost-server";
import { BUILD_PARAMETER_CACHE_MS, MAX_PARAMETER_CACHE_ENTRIES, readBuildParameters } from "./protocol-parameter-cache";

function raw(epoch = 600) {
  const p = DEFAULT_PROTOCOL_PARAMETERS;
  return { epoch, protocol_major_ver: 10, protocol_minor_ver: 0,
    coins_per_utxo_word: String(p.coinsPerUtxoSize), collateral_percent: p.collateralPercent,
    decentralisation_param: p.decentralisation, key_deposit: String(p.keyDeposit),
    max_block_ex_mem: String(p.maxBlockExMem), max_block_ex_steps: String(p.maxBlockExSteps),
    max_block_header_size: p.maxBlockHeaderSize, max_block_size: p.maxBlockSize,
    max_collateral_inputs: p.maxCollateralInputs, max_tx_ex_mem: String(p.maxTxExMem),
    max_tx_ex_steps: String(p.maxTxExSteps), max_tx_size: p.maxTxSize, max_val_size: String(p.maxValSize),
    min_fee_a: p.minFeeA, min_fee_b: p.minFeeB, min_pool_cost: String(p.minPoolCost),
    pool_deposit: String(p.poolDeposit), price_mem: p.priceMem, price_step: p.priceStep,
    cost_models_raw: { PlutusV1: [1, -2], PlutusV2: [3, 4], PlutusV3: [5, 6] } };
}

function provider(read: (path: string) => Promise<unknown>) {
  return { get: read } as unknown as BlockfrostProvider;
}

test("typed, model and build raw calls share one response while signing bypasses cache", async () => {
  let calls = 0;
  const source = provider(async () => { calls++; return raw(); });
  const [protocol, models, snapshot] = await Promise.all([
    executeMeshMethod(source, "fetchProtocolParameters", []),
    executeMeshMethod(source, "fetchCostModels", []),
    executeMeshMethod(source, "get", ["epochs/latest/parameters", true])
  ]);
  assert.deepEqual(protocol, { ...DEFAULT_PROTOCOL_PARAMETERS, epoch: 600 });
  assert.deepEqual(models, [[1, -2], [3, 4], [5, 6]]);
  assert.deepEqual(snapshot, raw());
  assert.equal(calls, 1);
  await executeMeshMethod(source, "get", ["epochs/latest/parameters"]);
  await executeMeshMethod(source, "get", ["epochs/latest/parameters"]);
  assert.equal(calls, 3);
});

test("parameter cache isolates providers, epochs, and returned values", async () => {
  let calls = 0;
  const read = async (path: string) => { calls++; return raw(path.includes("601") ? 601 : 600); };
  const first = provider(read);
  const snapshot = await readBuildParameters(first);
  snapshot.cost_models_raw.PlutusV3[0] = 99;
  assert.equal((await readBuildParameters(first)).cost_models_raw.PlutusV3[0], 5);
  await readBuildParameters(first, 601);
  await readBuildParameters(provider(read));
  assert.equal(calls, 3);
});

test("expired latest entries refresh the parameter version", async t => {
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  let calls = 0;
  const source = provider(async () => ({ ...raw(), protocol_major_ver: 10 + calls++ }));
  assert.equal((await readBuildParameters(source)).protocol_major_ver, 10);
  now += BUILD_PARAMETER_CACHE_MS;
  assert.equal((await readBuildParameters(source)).protocol_major_ver, 11);
});

test("failed and malformed parameter responses are evicted", async () => {
  let calls = 0;
  const source = provider(async () => {
    calls++;
    if (calls === 1) throw new Error("offline");
    if (calls === 2) return { ...raw(), min_fee_a: "invalid" };
    if (calls === 3) return { ...raw(), cost_models_raw: {} };
    return raw();
  });
  await assert.rejects(readBuildParameters(source), /offline/);
  await assert.rejects(readBuildParameters(source));
  await assert.rejects(readBuildParameters(source));
  await readBuildParameters(source);
  assert.equal(calls, 4);
});

test("parameter cache is bounded and refuses an explicit epoch mismatch", async () => {
  let calls = 0;
  const source = provider(async path => { calls++; return raw(Number(path.split("/")[1])); });
  for (let epoch = 0; epoch <= MAX_PARAMETER_CACHE_ENTRIES; epoch++) await readBuildParameters(source, epoch);
  await readBuildParameters(source, 0);
  assert.equal(calls, MAX_PARAMETER_CACHE_ENTRIES + 2);
  await assert.rejects(readBuildParameters(provider(async () => raw(600)), 601), /epoch does not match/);
});

test("build cache flag cannot cache other paths or bypass relative-path validation", async () => {
  const source = provider(async () => { throw new Error("must not reach provider"); });
  await assert.rejects(executeMeshMethod(source, "get", ["txs/hash/utxos", true]), /restricted/);
  await assert.rejects(executeMeshMethod(source, "get", ["https://evil.example", true]), /relative/);
  await assert.rejects(executeMeshMethod(source, "get", ["epochs/latest/parameters", "true"]), /boolean/);
});


test("explicit historical epochs retain the SDK path even without Plutus cost models", async () => {
  const calls: number[] = [];
  const source = {
    async get() { throw new Error("historical reads must not use the build cache"); },
    async fetchProtocolParameters(epoch: number) { calls.push(epoch); return { ...DEFAULT_PROTOCOL_PARAMETERS, epoch }; },
    async fetchCostModels(epoch: number) { calls.push(epoch); return [[epoch]]; }
  } as unknown as BlockfrostProvider;
  assert.deepEqual(await executeMeshMethod(source, "fetchProtocolParameters", [0]), { ...DEFAULT_PROTOCOL_PARAMETERS, epoch: 0 });
  assert.deepEqual(await executeMeshMethod(source, "fetchCostModels", [0]), [[0]]);
  assert.deepEqual(calls, [0, 0]);
});


test("a stalled parameter request expires without a late rejection evicting its replacement", async t => {
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  let rejectFirst!: (reason: Error) => void;
  let calls = 0;
  const source = provider(async () => {
    calls++;
    if (calls === 1) return new Promise((_, reject) => { rejectFirst = reject; });
    return { ...raw(), protocol_major_ver: 11 };
  });
  const first = readBuildParameters(source);
  const failure = assert.rejects(first, /stalled/);
  await Promise.resolve();
  now += MESH_READ_TIMEOUT_MS;
  const replacement = readBuildParameters(source).catch(() => undefined);
  await Promise.resolve();
  try {
    assert.equal(calls, 2);
    assert.equal((await replacement)?.protocol_major_ver, 11);
  } finally {
    rejectFirst(new Error("stalled"));
    await failure;
    await replacement;
  }
  assert.equal((await readBuildParameters(source)).protocol_major_ver, 11);
  assert.equal(calls, 2);
});
