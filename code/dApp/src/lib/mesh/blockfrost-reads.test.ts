import assert from "node:assert/strict";
import test from "node:test";
import { resolveNativeScriptHash } from "@meshsdk/core-cst";
import { MESH_READ_TIMEOUT_MS } from "./read-retry";
import {
  BlockfrostResponseError,
  fetchAddressUtxosStrict,
  fetchAssetAddressesStrict,
  fetchCollectionAssetsStrict,
  fetchTxUtxosStrict,
  MAX_SCRIPT_CACHE_ENTRIES,
  SCRIPT_CACHE_TTL_MS
} from "./blockfrost-reads";

const POLICY = "ab".repeat(28);
const HASH = "cd".repeat(32);
const SCRIPT_HASH = "ed67591f9f6bb0860f89d300936e8ceed1b71cac3f4633e993a3b8ad";
const PLUTUS_HASH = "4fff649fb4372ec3c408b6f0468d74e4d319904cde27fd3f00910a52";
const rawUtxo = {
  address: "addr_test1fixture",
  tx_hash: HASH,
  output_index: 2,
  amount: [{ unit: "lovelace", quantity: "2000000" }],
  data_hash: "aa".repeat(32),
  inline_datum: "19a6aa",
  reference_script_hash: null as string | null
};
const upstreamFailure = JSON.stringify({ status: 503, headers: {}, data: { message: "Unavailable" } });

test("address UTxOs retain datum fields and read all full pages", async () => {
  const paths: string[] = [];
  const rows = Array.from({ length: 100 }, (_, output_index) => ({ ...rawUtxo, output_index }));
  const provider = { get: async (path: string) => {
    paths.push(path);
    return path.includes("page=1&") ? rows : [rawUtxo];
  } };
  const utxos = await fetchAddressUtxosStrict(provider, rawUtxo.address, POLICY);
  assert.equal(utxos.length, 101);
  assert.equal(paths.length, 2);
  assert.match(paths[0]!, new RegExp(`/utxos/${POLICY}\\?count=100&page=1&order=asc$`));
  assert.deepEqual(utxos.at(-1), {
    input: { txHash: HASH, outputIndex: 2 },
    output: {
      address: rawUtxo.address,
      amount: rawUtxo.amount,
      dataHash: rawUtxo.data_hash,
      plutusData: rawUtxo.inline_datum,
      scriptHash: undefined,
      scriptRef: undefined
    }
  });
});

test("a failed later UTxO page rejects the whole read", async () => {
  const provider = { get: async (path: string) => {
    if (path.includes("page=2&")) throw upstreamFailure;
    return Array.from({ length: 100 }, () => rawUtxo);
  } };
  await assert.rejects(fetchAddressUtxosStrict(provider, rawUtxo.address), /"status":503/);
});

test("native reference scripts retain complete encoded bytes and are fetched once per read", async () => {
  const paths: string[] = [];
  const provider = { get: async (path: string) => {
    paths.push(path);
    if (path.includes("/utxos?")) return [0, 1].map((output_index) => ({ ...rawUtxo, output_index, reference_script_hash: SCRIPT_HASH }));
    if (path.endsWith("/json")) return { json: { type: "sig", keyHash: POLICY } };
    return { type: "timelock" };
  } };
  const utxos = await fetchAddressUtxosStrict(provider, rawUtxo.address);
  assert.equal(utxos[0]!.output.scriptHash, SCRIPT_HASH);
  assert.equal(utxos[0]!.output.scriptRef, `82008200581c${POLICY}`);
  assert.equal(utxos[1]!.output.scriptRef, utxos[0]!.output.scriptRef);
  assert.equal(paths.filter((path) => path.endsWith("/json")).length, 1);
});

test("Plutus reference scripts retain the language version and encoded bytes", async () => {
  const provider = { get: async (path: string) => {
    if (path.includes("/utxos?")) return [{ ...rawUtxo, reference_script_hash: PLUTUS_HASH }];
    if (path.endsWith("/cbor")) return { cbor: "4e4d01000033222220051200120011" };
    return { type: "plutusV3" };
  } };
  const [utxo] = await fetchAddressUtxosStrict(provider, rawUtxo.address);
  assert.equal(utxo!.output.scriptRef, "82034e4d01000033222220051200120011");
});

test("missing reference-script content is an error, not an empty wallet", async () => {
  const provider = { get: async (path: string) => {
    if (path.includes("/utxos?")) return [{ ...rawUtxo, reference_script_hash: SCRIPT_HASH }];
    throw JSON.stringify({ status: 404 });
  } };
  await assert.rejects(fetchAddressUtxosStrict(provider, rawUtxo.address), /"status":404/);
});

test("malformed UTxO fields cannot become successful cache data", async () => {
  for (const raw of [null, {}, [{ ...rawUtxo, tx_hash: undefined }], [{ ...rawUtxo, amount: [{ unit: "lovelace", quantity: "NaN" }] }], [{ ...rawUtxo, reference_script_hash: undefined }]]) {
    await assert.rejects(fetchAddressUtxosStrict({ get: async () => raw }, rawUtxo.address), BlockfrostResponseError);
  }
});

test("asset addresses page completely and preserve dotted asset names", async () => {
  const paths: string[] = [];
  const provider = { get: async (path: string) => {
    paths.push(path);
    return path.includes("page=1&") ? Array.from({ length: 100 }, () => ({ address: "holder", quantity: "1" })) : [{ address: "last", quantity: "2" }];
  } };
  const addresses = await fetchAssetAddressesStrict(provider, `${POLICY}.x`);
  assert.equal(addresses.length, 101);
  assert.match(paths[0]!, new RegExp(`/assets/${POLICY}78/addresses\\?`));
  assert.deepEqual(addresses.at(-1), { address: "last", quantity: "2" });
});

test("policy collections return the next page without swallowing malformed rows", async () => {
  const provider = { get: async () => Array.from({ length: 100 }, () => ({ asset: POLICY, quantity: "1" })) };
  const result = await fetchCollectionAssetsStrict(provider, POLICY, 3);
  assert.equal(result.assets.length, 100);
  assert.equal(result.next, 4);
  assert.deepEqual(result.assets[0], { unit: POLICY, quantity: "1" });
  await assert.rejects(fetchCollectionAssetsStrict({ get: async () => [{ asset: POLICY, quantity: false }] }, POLICY), BlockfrostResponseError);
  await assert.rejects(fetchAssetAddressesStrict({ get: async () => [{}] }, POLICY), BlockfrostResponseError);
});

test("404 collection absence becomes empty data, while transport errors stay errors", async () => {
  const absent = { get: async () => { throw JSON.stringify({ status: 404 }); } };
  assert.deepEqual(await fetchAddressUtxosStrict(absent, "address"), []);
  assert.deepEqual(await fetchAssetAddressesStrict(absent, POLICY), []);
  assert.deepEqual(await fetchCollectionAssetsStrict(absent, POLICY), { assets: [], next: null });
  const unavailable = { get: async () => { throw upstreamFailure; } };
  await assert.rejects(fetchAssetAddressesStrict(unavailable, POLICY), /"status":503/);
  await assert.rejects(fetchCollectionAssetsStrict(unavailable, POLICY), /"status":503/);
});

test("indexed transaction reads skip scripts in unrelated outputs", async () => {
  const paths: string[] = [];
  const provider = { get: async (path: string) => {
    paths.push(path);
    return { outputs: [{ ...rawUtxo, output_index: 0 }, { ...rawUtxo, output_index: 1, reference_script_hash: SCRIPT_HASH }] };
  } };
  const outputs = await fetchTxUtxosStrict(provider, HASH, 0);
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0]!.input.outputIndex, 0);
  assert.deepEqual(paths, [`txs/${HASH}/utxos`]);
});

test("transaction hydration shares verified scripts across calls but keeps provider identity separate", async () => {
  const makeProvider = () => {
    const paths: string[] = [];
    return { paths, get: async (path: string) => {
      paths.push(path);
      if (path.startsWith("txs/")) return { outputs: [0, 1].map(output_index => ({ ...rawUtxo, output_index, reference_script_hash: SCRIPT_HASH })) };
      if (path.endsWith("/json")) return { json: { type: "sig", keyHash: POLICY } };
      return { type: "timelock" };
    } };
  };
  const first = makeProvider();
  const all = await fetchTxUtxosStrict(first, HASH);
  const indexed = await fetchTxUtxosStrict(first, HASH, 1);
  assert.equal(all.length, 2);
  assert.deepEqual(indexed, [all[1]]);
  assert.equal(first.paths.filter(path => path.endsWith("/json")).length, 1);
  assert.equal(first.paths.filter(path => path.startsWith("txs/")).length, 2);
  const second = makeProvider();
  await fetchTxUtxosStrict(second, HASH, 0);
  assert.equal(second.paths.filter(path => path.endsWith("/json")).length, 1);
});

test("unverified script content is rejected and failed cache entries retry", async () => {
  let correct = false;
  let scriptReads = 0;
  const provider = { get: async (path: string) => {
    if (path.startsWith("txs/")) return { outputs: [{ ...rawUtxo, reference_script_hash: SCRIPT_HASH }] };
    if (path.endsWith("/json")) {
      scriptReads++;
      return { json: { type: "sig", keyHash: correct ? POLICY : "00".repeat(28) } };
    }
    return { type: "timelock" };
  } };
  await assert.rejects(fetchTxUtxosStrict(provider, HASH), BlockfrostResponseError);
  correct = true;
  await fetchTxUtxosStrict(provider, HASH);
  assert.equal(scriptReads, 2);
});

test("malformed transaction output data and missing script content reject rather than hide failures", async () => {
  for (const raw of [null, {}, { outputs: [{ ...rawUtxo, amount: [{ unit: "lovelace", quantity: "bad" }] }] }]) {
    await assert.rejects(fetchTxUtxosStrict({ get: async () => raw }, HASH), BlockfrostResponseError);
  }
  const provider = { get: async (path: string) => {
    if (path.startsWith("txs/")) return { outputs: [{ ...rawUtxo, reference_script_hash: SCRIPT_HASH }] };
    throw upstreamFailure;
  } };
  await assert.rejects(fetchTxUtxosStrict(provider, HASH), /"status":503/);
});

function nativeFixtures(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const keyHash = index.toString(16).padStart(56, "0");
    return { keyHash, hash: resolveNativeScriptHash({ type: "sig", keyHash }) };
  });
}

test("address script hydration overlaps distinct scripts with a bounded batch and stable output order", async () => {
  const fixtures = nativeFixtures(9);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started: string[] = [];
  const provider = { get: async (path: string) => {
    if (path.includes("/utxos?")) return fixtures.map(({ hash }, output_index) => ({ ...rawUtxo, output_index, reference_script_hash: hash }));
    const fixture = fixtures.find(({ hash }) => path.includes(hash))!;
    if (path.endsWith("/json")) { await gate; return { json: { type: "sig", keyHash: fixture.keyHash } }; }
    started.push(fixture.hash);
    return { type: "timelock" };
  } };
  const pending = fetchAddressUtxosStrict(provider, rawUtxo.address);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started.length, 8);
  release();
  const outputs = await pending;
  assert.equal(started.length, 9);
  assert.deepEqual(outputs.map(output => output.input.outputIndex), fixtures.map((_, index) => index));
});

test("script cache expires settled entries and bounds retained script hashes", async t => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const fixtures = nativeFixtures(MAX_SCRIPT_CACHE_ENTRIES + 1);
  let selected = fixtures[0]!;
  let reads = 0;
  const provider = { get: async (path: string) => {
    if (path.startsWith("txs/")) return { outputs: [{ ...rawUtxo, reference_script_hash: selected.hash }] };
    const fixture = fixtures.find(({ hash }) => path.includes(hash))!;
    if (path.endsWith("/json")) { reads++; return { json: { type: "sig", keyHash: fixture.keyHash } }; }
    return { type: "timelock" };
  } };
  await fetchTxUtxosStrict(provider, HASH);
  await fetchTxUtxosStrict(provider, HASH);
  assert.equal(reads, 1);
  now += SCRIPT_CACHE_TTL_MS;
  await fetchTxUtxosStrict(provider, HASH);
  assert.equal(reads, 2);
  for (const fixture of fixtures.slice(1)) {
    selected = fixture;
    await fetchTxUtxosStrict(provider, HASH);
  }
  selected = fixtures[0]!;
  await fetchTxUtxosStrict(provider, HASH);
  assert.equal(reads, MAX_SCRIPT_CACHE_ENTRIES + 3);
});

test("expired pending scripts retry and a late failure cannot evict their replacement", async t => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  let rejectFirst!: (reason: Error) => void;
  let reads = 0;
  const provider = { get: async (path: string) => {
    if (path.startsWith("txs/")) return { outputs: [{ ...rawUtxo, reference_script_hash: SCRIPT_HASH }] };
    if (path.endsWith("/json")) return { json: { type: "sig", keyHash: POLICY } };
    reads++;
    if (reads === 1) return new Promise<never>((_, reject) => { rejectFirst = reject; });
    return { type: "timelock" };
  } };
  const hung = fetchTxUtxosStrict(provider, HASH);
  const rejected = assert.rejects(hung, /late failure/);
  await new Promise(resolve => setImmediate(resolve));
  now += MESH_READ_TIMEOUT_MS;
  await fetchTxUtxosStrict(provider, HASH);
  rejectFirst(new Error("late failure"));
  await rejected;
  await fetchTxUtxosStrict(provider, HASH);
  assert.equal(reads, 2);
});
