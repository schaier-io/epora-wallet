import assert from "node:assert/strict";
import test from "node:test";
import type { UTxO } from "@meshsdk/common";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import type { TxFetcher } from "@/lib/mesh/tx-context";
import { createBuildParameterFetcher } from "./build-parameter-fetcher";
import { assertExactInputUnspent } from "./utxo";
import { INPUT_METADATA_CACHE_MS, INPUT_METADATA_PENDING_MS, MAX_INPUT_METADATA_ENTRIES, readImmutableInputMetadata } from "./immutable-input-cache";
const hash = "ab".repeat(32);
function output(txHash = hash, outputIndex = 0): UTxO[] {
  return [{ input: { txHash, outputIndex }, output: { address: "addr_test", amount: [{ unit: "lovelace", quantity: "1" }],
    dataHash: "data", plutusData: "datum", scriptRef: "script", scriptHash: "scriptHash" } }];
}
function provider(read: (hash: string, index?: number) => Promise<UTxO[]> = async h => output(h)) {
  let calls = 0;
  const fetcher = { fetchUTxOs: async (h: string, i?: number) => { calls++; return read(h, i); } } as TxFetcher;
  return { fetcher, calls: () => calls };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
test("builds share immutable output content but callers cannot mutate cached values", async () => {
  const dirty = output();
  Object.assign(dirty[0].output, { consumed_by: "mutable", spent: true });
  Object.assign(dirty[0].input, { consumed_by: "mutable" });
  const p = provider(async () => dirty);
  const builds = [createBuildParameterFetcher(p.fetcher), createBuildParameterFetcher(p.fetcher)];
  const [first, second] = await Promise.all(builds.map(build => build.fetchUTxOs(hash, 0)));
  assert.equal(p.calls(), 1);
  assert.deepEqual(second, output());
  first[0].output.amount[0].quantity = "99";
  dirty[0].output.scriptRef = "changed";
  assert.deepEqual(await createBuildParameterFetcher(p.fetcher).fetchUTxOs(hash, 0), output());
});
test("network, provider, output index and whole transaction scopes remain separate", async () => {
  const p = provider(async (h, i) => output(h, i ?? 0));
  const other = provider();
  await readImmutableInputMetadata(p.fetcher, hash, 0, "preview");
  await readImmutableInputMetadata(p.fetcher, hash.toUpperCase(), 0, "preview");
  await readImmutableInputMetadata(p.fetcher, hash, 0, "preprod");
  await readImmutableInputMetadata(p.fetcher, hash, 1, "preview");
  await readImmutableInputMetadata(p.fetcher, hash, undefined, "preview");
  await readImmutableInputMetadata(other.fetcher, hash, 0, "preview");
  assert.equal(p.calls(), 4);
  assert.equal(other.calls(), 1);
});
test("successful entries expire and entry count stays bounded", async t => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const p = provider();
  await readImmutableInputMetadata(p.fetcher, hash);
  now += INPUT_METADATA_CACHE_MS;
  await readImmutableInputMetadata(p.fetcher, hash);
  assert.equal(p.calls(), 2);
  for (let i = 0; i < MAX_INPUT_METADATA_ENTRIES; i++) await readImmutableInputMetadata(p.fetcher, i.toString(16).padStart(64, "0"));
  await readImmutableInputMetadata(p.fetcher, hash);
  assert.equal(p.calls(), MAX_INPUT_METADATA_ENTRIES + 3);
});
test("expired pending reads cannot delete or replace a newer read", async t => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const old = deferred<UTxO[]>();
  let calls = 0;
  const p = provider(async () => ++calls === 1 ? old.promise : output());
  const first = readImmutableInputMetadata(p.fetcher, hash);
  await Promise.resolve();
  now += INPUT_METADATA_PENDING_MS;
  await readImmutableInputMetadata(p.fetcher, hash);
  old.reject(new Error("old failed"));
  await assert.rejects(first, /old failed/);
  await readImmutableInputMetadata(p.fetcher, hash);
  assert.equal(p.calls(), 2);
});
test("empty, malformed, mismatched and failed reads never become sticky", async () => {
  const invalid = [[], output("cd".repeat(32)), output(hash, 1),
    [{ ...output()[0], output: { ...output()[0].output, amount: [{ unit: "lovelace", quantity: "-1" }] } }],
    [{ ...output()[0], input: { txHash: 1, outputIndex: 0 } }]];
  for (const value of invalid) {
    let reads = 0;
    const p = provider(async () => ++reads === 1 ? value as UTxO[] : output());
    await readImmutableInputMetadata(p.fetcher, hash, 0);
    assert.deepEqual(await readImmutableInputMetadata(p.fetcher, hash, 0), output());
    await readImmutableInputMetadata(p.fetcher, hash, 0);
    assert.equal(p.calls(), 2);
  }
  let reads = 0;
  const p = provider(async () => { if (++reads === 1) throw new Error("offline"); return output(); });
  await assert.rejects(readImmutableInputMetadata(p.fetcher, hash), /offline/);
  await readImmutableInputMetadata(p.fetcher, hash);
  assert.equal(p.calls(), 2);
});
test("ServerFetcher instances share settled content without sharing caller cancellation", async () => {
  const abort = new AbortController();
  const old = deferred<UTxO[]>();
  const canceled = new ServerFetcher({ signal: abort.signal });
  const other = new ServerFetcher();
  const uniqueHash = "ef".repeat(32);
  canceled.fetchUTxOs = () => old.promise;
  let calls = 0;
  other.fetchUTxOs = async () => { calls++; return output(uniqueHash); };
  const first = readImmutableInputMetadata(canceled, uniqueHash, 0);
  await Promise.resolve();
  const next = new ServerFetcher();
  next.fetchUTxOs = other.fetchUTxOs;
  await readImmutableInputMetadata(next, uniqueHash, 0);
  abort.abort();
  old.resolve(output(uniqueHash));
  await assert.rejects(first, { name: "AbortError" });
  await readImmutableInputMetadata(other, uniqueHash, 0);
  assert.equal(calls, 1);
  const hitAbort = new AbortController();
  const hit = new ServerFetcher({ signal: hitAbort.signal });
  hitAbort.abort();
  await assert.rejects(readImmutableInputMetadata(hit, uniqueHash, 0), { name: "AbortError" });
});

test("a late pending success cannot overwrite the current cache entry", async t => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const old = deferred<UTxO[]>();
  let reads = 0;
  const current = output();
  current[0].output.amount[0].quantity = "2";
  const p = provider(async () => ++reads === 1 ? old.promise : current);
  const first = readImmutableInputMetadata(p.fetcher, hash);
  await Promise.resolve();
  now += INPUT_METADATA_PENDING_MS;
  await readImmutableInputMetadata(p.fetcher, hash);
  old.resolve(output());
  await first;
  assert.deepEqual(await readImmutableInputMetadata(p.fetcher, hash), current);
  assert.equal(p.calls(), 2);
});

test("aborted build-local cache hits still reject", async () => {
  const abort = new AbortController();
  const p = provider();
  Object.defineProperty(p.fetcher, "signal", { value: abort.signal });
  const build = createBuildParameterFetcher(p.fetcher);
  await build.fetchUTxOs(hash);
  abort.abort();
  await assert.rejects(build.fetchUTxOs(hash), { name: "AbortError" });
  assert.equal(p.calls(), 1);
});

test("metadata reuse across builds still detects an input spent after the first build", async () => {
  const p = provider();
  let statusReads = 0;
  p.fetcher.get = async () => ({ outputs: [{ output_index: 0,
    consumed_by_tx: ++statusReads === 1 ? null : "new-spender" }] });
  const ref = { txHash: hash, outputIndex: 0 };
  const first = createBuildParameterFetcher(p.fetcher);
  await Promise.all([first.fetchUTxOs(hash, 0), assertExactInputUnspent(first, ref, "Input", true)]);
  const second = createBuildParameterFetcher(p.fetcher);
  await second.fetchUTxOs(hash, 0);
  await assert.rejects(assertExactInputUnspent(second, ref, "Input", true), /already spent by new-spender/);
  assert.equal(p.calls(), 1);
  assert.equal(statusReads, 2);
});

test("only explicit transport scopes share metadata across provider instances", async () => {
  const scope = {};
  const first = provider();
  const shared = provider();
  Object.assign(first.fetcher, { inputMetadataCacheScope: scope });
  Object.assign(shared.fetcher, { inputMetadataCacheScope: scope });
  await readImmutableInputMetadata(first.fetcher, hash, 0);
  await readImmutableInputMetadata(shared.fetcher, hash, 0);
  assert.equal(first.calls(), 1);
  assert.equal(shared.calls(), 0);

  const other = provider(async () => {
    const value = output();
    value[0].output.amount[0].quantity = "2";
    return value;
  });
  assert.equal((await readImmutableInputMetadata(other.fetcher, hash, 0))[0].output.amount[0].quantity, "2");
  assert.equal(other.calls(), 1);
});
