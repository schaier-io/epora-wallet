import assert from "node:assert/strict";
import test from "node:test";
import { BlockfrostProvider } from "@meshsdk/core";
import { executeMeshMethod } from "./blockfrost-server";
import { retryMeshRead } from "./read-retry";

const hash = (index: number) => index.toString(16).padStart(64, "0");
const rows = (count: number) => Array.from({ length: count }, (_, index) => ({
  tx_hash: hash(index), block_height: index, block_time: index
}));
const metadata = (hash: string) => ({ hash, block: "ab".repeat(32), slot: 1, index: 0,
  fees: "1", deposit: "0", size: 100, invalid_before: null, invalid_hereafter: null });
const io = { inputs: [], outputs: [] };
function provider(get: (path: string) => Promise<unknown>) {
  const value = new BlockfrostProvider("preprod_fixture");
  const transport = value as unknown as { _axiosInstance: { get: (path: string) => Promise<unknown> } };
  transport._axiosInstance.get = async path => ({ status: 200, data: await get(path) });
  return value;
}

test("history hydrates concurrently with a bounded request count and keeps ledger order", async () => {
  let active = 0;
  let peak = 0;
  const source = rows(12);
  const value = provider(async path => {
    if (path.includes("/addresses/")) return path.includes("page=1&") ? source : [];
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, path.endsWith(hash(0)) ? 10 : 2));
    active--;
    return path.endsWith("/utxos") ? io : metadata(path.split("/").at(-1)!);
  });
  const result = await executeMeshMethod(value, "fetchAddressTxs", ["address", { maxPage: 8, order: "desc" }]);
  assert.ok(peak > 1, `Expected concurrent history reads, saw ${peak}`);
  assert.ok(peak <= 8, `Expected at most eight requests, saw ${peak}`);
  assert.deepEqual((result as Array<{ hash: string }>).map(tx => tx.hash), source.map(tx => tx.tx_hash));
});

test("history cancellation starts no UTxO or later transaction requests", async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const value = provider(async path => {
    calls.push(path);
    if (path.includes("/addresses/")) return rows(12);
    controller.abort(new Error("History cancelled"));
    return path.endsWith("/utxos") ? io : metadata(path.split("/").at(-1)!);
  });
  await assert.rejects(executeMeshMethod(value, "fetchAddressTxs", ["address", { maxPage: 8 }], controller.signal), /History cancelled/);
  assert.equal(calls.filter(path => path.endsWith("/utxos")).length, 0);
  assert.equal(calls.filter(path => !path.includes("/addresses/")).length, 1);
});

test("history preserves all requested pages and transaction metadata", async () => {
  const paths: string[] = [];
  const source = rows(100);
  const output = { address: "address", output_index: 0, amount: [{ unit: "lovelace", quantity: "2000000" }],
    inline_datum: "d87980", reference_script_hash: "ab".repeat(28), collateral: false };
  const transactionIo = { inputs: [{ ...output, tx_hash: hash(102) }], outputs: [output] };
  const value = provider(async path => {
    paths.push(path);
    if (path.includes("/addresses/")) return path.includes("page=1&") ? source : [rows(101)[100]];
    return path.endsWith("/utxos") ? transactionIo : metadata(path.split("/").at(-1)!);
  });
  const result = await executeMeshMethod(value, "fetchAddressTxs", ["address", { maxPage: 2, order: "asc" }]) as unknown[];
  assert.equal(result.length, 101);
  assert.equal(paths.filter(path => path.includes("/addresses/")).length, 2);
  assert.deepEqual(result[0], { ...transactionIo, hash: hash(0), block: "ab".repeat(32), slot: "1", index: 0,
    fees: "1", deposit: "0", size: 100, invalidBefore: "", invalidAfter: "", blockHeight: 0, blockTime: 0 });
});

test("history deadline rejects stalled reads and late responses start no further requests", async () => {
  const calls: string[] = [];
  const release: Array<(value: unknown) => void> = [];
  const value = provider(async path => {
    calls.push(path);
    if (path.includes("/addresses/")) return rows(12);
    return new Promise(resolve => release.push(resolve));
  });
  const keepAlive = setTimeout(() => {}, 100);
  try {
    await assert.rejects(retryMeshRead("fetchAddressTxs", signal =>
      executeMeshMethod(value, "fetchAddressTxs", ["address", { maxPage: 8 }], signal),
    () => undefined, undefined, 10), { name: "TimeoutError" });
    assert.equal(calls.length, 9);
    release.forEach((resolve, index) => resolve(metadata(hash(index))));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 9);
  } finally { clearTimeout(keepAlive); }
});

test("failed transaction hydration rejects history and stops sibling requests", async () => {
  const calls: string[] = [];
  const value = provider(async path => {
    calls.push(path);
    if (path.includes("/addresses/")) return rows(12);
    throw JSON.stringify({ status: 404, data: { message: "Missing transaction" } });
  });
  await assert.rejects(executeMeshMethod(value, "fetchAddressTxs", ["address", { maxPage: 8 }]), /Missing transaction/);
  assert.ok(calls.length <= 9);
  assert.equal(calls.filter(path => path.endsWith("/utxos")).length, 0);
});

test("history rejects malformed pages before fetching transactions", async () => {
  const calls: string[] = [];
  const value = provider(async path => { calls.push(path); return [{ tx_hash: "invalid" }]; });
  await assert.rejects(executeMeshMethod(value, "fetchAddressTxs", ["address", { maxPage: 8 }]), /invalid response/);
  assert.equal(calls.length, 1);
});
