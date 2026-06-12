import assert from "node:assert/strict";
import test from "node:test";
import type { UTxO } from "@meshsdk/core";
import {
  compareInputRefs,
  createInputRefKey,
  dedupeUtxos,
  ensureUniqueWalletInputRefs,
  findUtxo,
  resolveSttInputUtxo
} from "@/lib/mesh/transactions/internals/utxo";

function utxo(txHash: string, outputIndex: number, lovelace = "1000000"): UTxO {
  return {
    input: { txHash, outputIndex },
    output: {
      address: "addr_test1qexample",
      amount: [{ unit: "lovelace", quantity: lovelace }]
    }
  } as UTxO;
}

function sttUtxo(txHash: string, outputIndex: number, unit: string): UTxO {
  return {
    input: { txHash, outputIndex },
    output: {
      address: "addr_test1qexample",
      amount: [
        { unit: "lovelace", quantity: "2000000" },
        { unit, quantity: "1" }
      ]
    }
  } as UTxO;
}

const HASH_A = "aa".repeat(32);
const HASH_B = "bb".repeat(32);
const STT_UNIT = "pp".repeat(28) + "deadbeef";

test("createInputRefKey joins txHash and outputIndex", () => {
  assert.equal(createInputRefKey(HASH_A, 3), `${HASH_A}#3`);
});

test("compareInputRefs is a case-insensitive lexical comparison", () => {
  assert.equal(compareInputRefs("aa#0", "aa#0"), 0);
  assert.ok(compareInputRefs("aa#0", "bb#0") < 0);
  assert.equal(compareInputRefs("AA#0", "aa#0"), 0);
});

test("dedupeUtxos keeps the first occurrence of each txHash#index", () => {
  const first = utxo(HASH_A, 0, "111");
  const duplicate = utxo(HASH_A, 0, "999");
  const distinctIndex = utxo(HASH_A, 1, "222");
  const distinctHash = utxo(HASH_B, 0, "333");

  const result = dedupeUtxos([first, duplicate, distinctIndex, distinctHash]);

  assert.equal(result.length, 3);
  // The first-seen object wins; the later duplicate is discarded.
  assert.equal(result[0].output.amount[0].quantity, "111");
  assert.deepEqual(
    result.map((u) => createInputRefKey(u.input.txHash, u.input.outputIndex)),
    [`${HASH_A}#0`, `${HASH_A}#1`, `${HASH_B}#0`]
  );
});

test("findUtxo locates by hash, by hash+index, and throws when absent", () => {
  const utxos = [utxo(HASH_A, 0), utxo(HASH_A, 1), utxo(HASH_B, 0)];

  assert.equal(findUtxo(utxos, HASH_A).input.outputIndex, 0);
  assert.equal(findUtxo(utxos, HASH_A, 1).input.outputIndex, 1);
  assert.throws(() => findUtxo(utxos, HASH_A, 9), /UTxO not found/);
  assert.throws(() => findUtxo(utxos, "cc".repeat(32)), /UTxO not found/);
});

test("resolveSttInputUtxo prefers the txHash reference when it exists", () => {
  const referenced = sttUtxo(HASH_A, 0, STT_UNIT);
  const utxos = [utxo(HASH_B, 0), referenced];

  // Exact reference wins even though another UTxO could hold the asset.
  assert.equal(resolveSttInputUtxo(utxos, HASH_A, 0, STT_UNIT), referenced);
});

test("resolveSttInputUtxo falls back to the unique STT-holding UTxO when the ref is stale", () => {
  // The cached reference (HASH_A) was spent; the STT moved to HASH_B. The unique NFT-holding
  // UTxO is found by asset unit instead of failing with "UTxO not found".
  const moved = sttUtxo(HASH_B, 1, STT_UNIT);
  const unrelated = utxo("cc".repeat(32), 0);
  const utxos = [unrelated, moved];

  assert.equal(resolveSttInputUtxo(utxos, HASH_A, 0, STT_UNIT), moved);
});

test("resolveSttInputUtxo throws when no UTxO holds the STT and the ref is absent", () => {
  const utxos = [utxo(HASH_B, 0)];
  assert.throws(() => resolveSttInputUtxo(utxos, HASH_A, 0, STT_UNIT), /UTxO not found/);
});

test("resolveSttInputUtxo rejects an ambiguous STT (a unique NFT must live in one UTxO)", () => {
  const utxos = [sttUtxo(HASH_A, 0, STT_UNIT), sttUtxo(HASH_B, 0, STT_UNIT)];
  // Reference matches HASH_A here, so add a case with no matching ref to force the asset path.
  assert.throws(
    () => resolveSttInputUtxo(utxos, "cc".repeat(32), 0, STT_UNIT),
    /Ambiguous STT input/
  );
});

test("ensureUniqueWalletInputRefs passes distinct refs and rejects duplicates", () => {
  assert.doesNotThrow(() =>
    ensureUniqueWalletInputRefs([
      { txHash: HASH_A, outputIndex: 0 },
      { txHash: HASH_A, outputIndex: 1 },
      { txHash: HASH_B, outputIndex: 0 }
    ])
  );
  assert.throws(
    () =>
      ensureUniqueWalletInputRefs([
        { txHash: HASH_A, outputIndex: 0 },
        { txHash: HASH_A, outputIndex: 0 }
      ]),
    /Duplicate wallet input reference/
  );
});
