import assert from "node:assert/strict";
import test from "node:test";
import type { TxFetcher } from "@/lib/mesh/tx-context";
import { createPreparationReadAhead } from "./preparation-read-ahead";
import { assertExactInputUnspent } from "./utxo";

const HASH = "ab".repeat(32);
const REF = { txHash: HASH, outputIndex: 0 };

test("starts metadata and status reads before consumers and returns isolated results", async () => {
  let metadataReads = 0;
  let statusReads = 0;
  const fetcher = {
    fetchUTxOs: async () => { metadataReads++; return [{ input: REF, output: { amount: [] } }]; },
    get: async () => { statusReads++; return { outputs: [{ output_index: 0, consumed_by_tx: null }] }; }
  } as unknown as TxFetcher;
  const ahead = createPreparationReadAhead(fetcher);
  ahead.prefetchInput(REF);
  await Promise.resolve();
  assert.equal(metadataReads, 1);
  assert.equal(statusReads, 1);
  const first = await ahead.fetcher.fetchUTxOs(HASH, 0);
  first[0]!.input.outputIndex = 9;
  assert.equal((await ahead.fetcher.fetchUTxOs(HASH, 0))[0]!.input.outputIndex, 0);
  assert.equal(metadataReads, 1);
  await ahead.fetcher.get(`txs/${HASH}/utxos`);
  assert.equal(statusReads, 1);
});

test("retains an early failure until validation consumes it instead of retrying", async () => {
  const failure = new Error("provider unavailable");
  let calls = 0;
  const fetcher = {
    fetchUTxOs: async () => { calls++; if (calls === 1) throw failure; return []; },
    get: async () => ({ outputs: [] })
  } as unknown as TxFetcher;
  const ahead = createPreparationReadAhead(fetcher);
  ahead.prefetchInput(REF);
  await new Promise<void>(resolve => setImmediate(resolve));
  await assert.rejects(ahead.fetcher.fetchUTxOs(HASH, 0), error => error === failure);
  assert.equal(calls, 1);
  const nextPass = createPreparationReadAhead(fetcher);
  assert.deepEqual(await nextPass.fetcher.fetchUTxOs(HASH, 0), []);
  assert.equal(calls, 2);
});

test("each preparation pass rereads status and rejects spent inputs", async () => {
  let spent = false;
  let reads = 0;
  const fetcher = {
    fetchUTxOs: async () => [],
    get: async () => { reads++; return { outputs: [{ output_index: 0, consumed_by_tx: spent ? HASH : null }] }; }
  } as unknown as TxFetcher;
  const draft = createPreparationReadAhead(fetcher);
  draft.prefetchInput(REF);
  assert.deepEqual(await draft.fetcher.get(`txs/${HASH}/utxos`), { outputs: [{ output_index: 0, consumed_by_tx: null }] });
  spent = true;
  const final = createPreparationReadAhead(fetcher);
  final.prefetchInput(REF);
  assert.deepEqual(await final.fetcher.get(`txs/${HASH}/utxos`), { outputs: [{ output_index: 0, consumed_by_tx: HASH }] });
  await assert.rejects(assertExactInputUnspent(final.fetcher, REF, "Wallet input", true), /already spent/);
  assert.equal(reads, 2);
});

test("cached reads and pending reads honor cancellation", async () => {
  const controller = new AbortController();
  const fetcher = {
    signal: controller.signal,
    fetchUTxOs: async () => [],
    get: async () => new Promise(() => {})
  } as unknown as TxFetcher;
  const ahead = createPreparationReadAhead(fetcher);
  await ahead.fetcher.fetchUTxOs(HASH, 0);
  const pending = ahead.fetcher.get(`txs/${HASH}/utxos`);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(ahead.fetcher.fetchUTxOs(HASH, 0), { name: "AbortError" });
});

test("reference prefetch defers saved references and malformed locators to their original validators", async () => {
  const fetchUTxOs = test.mock.fn(async () => []);
  const get = test.mock.fn(async () => ({}));
  const ahead = createPreparationReadAhead({ fetchUTxOs, get } as unknown as TxFetcher);
  for (const reference of [undefined, "", "not-a-reference"]) ahead.prefetchReference(reference);
  await Promise.resolve();
  assert.equal(fetchUTxOs.mock.callCount(), 0);
  assert.equal(get.mock.callCount(), 0);
  ahead.prefetchReference(`${HASH}:0`);
  await ahead.fetcher.fetchUTxOs(HASH, 0);
  assert.equal(fetchUTxOs.mock.callCount(), 1);
  assert.equal(get.mock.callCount(), 1);
});
