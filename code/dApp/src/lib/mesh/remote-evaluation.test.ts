import assert from "node:assert/strict";
import test from "node:test";
import type { UTxO } from "@meshsdk/common";
import type { TxFetcher } from "./tx-context";
import { evaluateRemoteTx } from "./remote-evaluation";

const HASH = "ab".repeat(32);
const output = (index: number): UTxO => ({ input: { txHash: HASH, outputIndex: index },
  output: { address: "unused", amount: [] } });
const failure = (value: unknown) => JSON.stringify(JSON.stringify({ result: { EvaluationFailure: value } }));
const overlap = failure({ AdditionalUtxoOverlap: [{ txId: HASH.toUpperCase(), index: 0 }] });
const budgets = [{ tag: "SPEND" as const, index: 0, budget: { mem: 1, steps: 2 } }];

test("remote evaluation removes exact overlaps once and preserves context and caller values", async () => {
  const utxos = [output(0), output(1)];
  const chained = ["chained-cbor"];
  const calls: unknown[][] = [];
  const provider = { evaluateTx: async (...args) => {
    calls.push(args);
    if (calls.length === 1) throw new Error(overlap);
    return budgets;
  } } satisfies Pick<TxFetcher, "evaluateTx">;
  assert.deepEqual(await evaluateRemoteTx(provider, "tx", utxos, chained), budgets);
  assert.deepEqual(calls, [["tx", utxos, chained], ["tx", [output(1)], chained]]);
  assert.deepEqual(utxos, [output(0), output(1)]);
  assert.deepEqual(chained, ["chained-cbor"]);
});

test("remote evaluation retries with an empty supplemental set when every input overlaps", async () => {
  const calls: unknown[][] = [];
  const provider = { evaluateTx: async (...args) => {
    calls.push(args);
    if (calls.length === 1) throw overlap;
    return budgets;
  } } satisfies Pick<TxFetcher, "evaluateTx">;
  await evaluateRemoteTx(provider, "tx", [output(0)]);
  assert.deepEqual(calls[1], ["tx", [], undefined]);
});

test("remote evaluation propagates the retry failure without a third call", async () => {
  let calls = 0;
  const second = new Error("second evaluation failure");
  const provider = { evaluateTx: async () => {
    if (++calls === 1) throw overlap;
    throw second;
  } } satisfies Pick<TxFetcher, "evaluateTx">;
  await assert.rejects(evaluateRemoteTx(provider, "tx", [output(0)]), error => error === second);
  assert.equal(calls, 2);
});

for (const [name, error] of [
  ["validator failure", failure({ ScriptFailures: {} })],
  ["mixed failures", failure({ AdditionalUtxoOverlap: [{ txId: HASH, index: 0 }], ScriptFailures: {} })],
  ["empty overlaps", failure({ AdditionalUtxoOverlap: [] })],
  ["invalid hash", failure({ AdditionalUtxoOverlap: [{ txId: "bad", index: 0 }] })],
  ["invalid index", failure({ AdditionalUtxoOverlap: [{ txId: HASH, index: -1 }] })],
  ["string index", failure({ AdditionalUtxoOverlap: [{ txId: HASH, index: "0" }] })],
  ["partially malformed overlaps", failure({ AdditionalUtxoOverlap: [{ txId: HASH, index: 0 }, null] })],
  ["unrelated reference", failure({ AdditionalUtxoOverlap: [{ txId: HASH, index: 2 }] })],
  ["upstream outage", JSON.stringify({ status: 503 })],
  ["transport error", new Error("network failed")]
] as const) {
  test(`remote evaluation does not retry ${name}`, async () => {
    let calls = 0;
    const provider = { evaluateTx: async () => { calls++; throw error; } } satisfies Pick<TxFetcher, "evaluateTx">;
    await assert.rejects(evaluateRemoteTx(provider, "tx", [output(0)]), actual => actual === error);
    assert.equal(calls, 1);
  });
}

test("remote evaluation does not retry an overlap when no supplemental inputs were supplied", async () => {
  let calls = 0;
  const provider = { evaluateTx: async () => { calls++; throw overlap; } } satisfies Pick<TxFetcher, "evaluateTx">;
  await assert.rejects(evaluateRemoteTx(provider, "tx"), actual => actual === overlap);
  assert.equal(calls, 1);
});

test("remote overlap filtering does not crash on malformed unmatched supplemental entries", async () => {
  const supplied = [null, output(0)] as unknown as UTxO[];
  let calls = 0;
  const provider = { evaluateTx: async (_tx, utxos) => {
    if (++calls === 1) throw overlap;
    assert.deepEqual(utxos, [null]);
    return budgets;
  } } satisfies Pick<TxFetcher, "evaluateTx">;
  await evaluateRemoteTx(provider, "tx", supplied);
  assert.equal(calls, 2);
});
