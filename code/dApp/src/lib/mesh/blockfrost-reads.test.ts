import assert from "node:assert/strict";
import test from "node:test";
import {
  BlockfrostResponseError,
  fetchAddressUtxosStrict,
  fetchAssetAddressesStrict,
  fetchCollectionAssetsStrict
} from "./blockfrost-reads";

const POLICY = "ab".repeat(28);
const HASH = "cd".repeat(32);
const SCRIPT_HASH = "ef".repeat(28);
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
    if (path.includes("/utxos?")) return [{ ...rawUtxo, reference_script_hash: SCRIPT_HASH }];
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
