import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dedupeUtxosByRef,
  mergeAndSortTransactions,
  normalizeTransactionIo,
  transactionTouchesAddress
} from "./transactions";
import { type TransactionInfo } from "@meshsdk/common";

const TX_HASH = "ab".repeat(32);
const PREV_TX_HASH = "cd".repeat(32);
const WALLET = "addr_test1walletaddress";
const EXTERNAL = "addr_test1externaladdress";

/**
 * The raw entries Blockfrost's tx-utxos endpoint returns, exactly as Mesh's
 * `fetchTxInfo` passes them through. They are what the provider hands back for
 * every transaction the activity feed fetches.
 */
function rawInput(outputIndex: number, address: string, lovelace: string, sourceHash = PREV_TX_HASH) {
  return {
    address,
    amount: [{ unit: "lovelace", quantity: lovelace }],
    output_index: outputIndex,
    tx_hash: sourceHash
  };
}

function legacyShapedInput(outputIndex: number, address: string, lovelace: string) {
  return {
    address,
    amount: [{ unit: "lovelace", quantity: lovelace }],
    output_index: outputIndex,
    transaction: { hash: PREV_TX_HASH, index: outputIndex }
  };
}

function rawOutput(outputIndex: number, address: string, lovelace: string) {
  return {
    address,
    amount: [{ unit: "lovelace", quantity: lovelace }],
    output_index: outputIndex
  };
}

function rawTransaction(): TransactionInfo {
  return {
    hash: TX_HASH,
    index: 0,
    slot: "1",
    blockTime: 1_700_000_000,
    block: "block",
    fees: "150000",
    size: 0,
    deposit: "0",
    invalidBefore: "",
    invalidAfter: "",
    inputs: [rawInput(0, EXTERNAL, "10000000")] as never,
    outputs: [rawOutput(0, WALLET, "6000000")] as never
  } as TransactionInfo;
}

test("normalizeTransactionIo translates raw Blockfrost entries into the Mesh UTxO shape", () => {
  const normalized = normalizeTransactionIo(rawTransaction());

  assert.equal(normalized.inputs.length, 1);
  assert.equal(normalized.inputs[0]!.input.txHash, PREV_TX_HASH);
  assert.equal(normalized.inputs[0]!.input.outputIndex, 0);
  assert.equal(normalized.inputs[0]!.output.address, EXTERNAL);
  assert.equal(normalized.inputs[0]!.output.amount[0]!.quantity, "10000000");

  // An output of this transaction has no `tx_hash` source of its own; its
  // hash is the transaction it belongs to.
  assert.equal(normalized.outputs[0]!.input.txHash, TX_HASH);
  assert.equal(normalized.outputs[0]!.output.address, WALLET);
});

test("the provider's legacy transaction-shaped input still maps to its real source", () => {
  const legacy = normalizeTransactionIo({
    ...rawTransaction(),
    inputs: [legacyShapedInput(2, EXTERNAL, "10000000")] as never
  } as TransactionInfo);

  assert.equal(legacy.inputs.length, 1);
  assert.equal(legacy.inputs[0]!.input.txHash, PREV_TX_HASH);
  assert.equal(legacy.inputs[0]!.input.outputIndex, 2);
});

test("two wallet inputs from different source transactions survive normalize and dedupe", () => {
  // Live regression (tx f244b12b…): Blockfrost listed the wallet's 4₳ and 5₳ inputs
  // with different source hashes but the same output_index. When the normalizer
  // stamped every input with the containing transaction's hash, both collapsed to
  // one ref, the wallet-side inputs vanished from the balance delta, and the
  // net-zero manage transaction read as "+9 ₳" — doubling the balance chart.
  const tx = rawTransaction();
  const normalized = normalizeTransactionIo({
    ...tx,
    inputs: [
      rawInput(0, WALLET, "4000000", "aa".repeat(32)),
      rawInput(0, WALLET, "5000000", "bb".repeat(32)),
      rawInput(1, EXTERNAL, "978961311")
    ] as never
  } as TransactionInfo);

  const deduped = dedupeUtxosByRef(normalized.inputs);
  assert.equal(deduped.length, 3);
  assert.equal(deduped.filter((input) => input.output.address === WALLET).length, 2);
});

test("normalizeTransactionIo leaves already-Mesh-shaped entries untouched", () => {
  const meshShaped = {
    ...rawTransaction(),
    inputs: [
      {
        input: { txHash: PREV_TX_HASH, outputIndex: 3 },
        output: { address: EXTERNAL, amount: [{ unit: "lovelace", quantity: "5" }] }
      }
    ]
  } as TransactionInfo;

  const normalized = normalizeTransactionIo(meshShaped);
  assert.equal(normalized.inputs[0]!.input.outputIndex, 3);
  assert.equal(normalized.outputs.length, 1);
});

test("an unnormalized transaction touches no address, which is how the wallet's history went missing", () => {
  // The address filter kept only transactions anchored by a current UTxO;
  // every other transaction the address endpoint returned was dropped here.
  assert.equal(transactionTouchesAddress(rawTransaction(), WALLET), false);
  assert.equal(transactionTouchesAddress(normalizeTransactionIo(rawTransaction()), WALLET), true);
  assert.equal(transactionTouchesAddress(normalizeTransactionIo(rawTransaction()), EXTERNAL), true);
});

test("entries without an address or a hash resolve to nothing rather than crashing", () => {
  const normalized = normalizeTransactionIo({
    ...rawTransaction(),
    inputs: [null, { amount: [] }, { address: EXTERNAL }] as never,
    outputs: [{ address: WALLET, amount: [{ unit: "lovelace", quantity: "1" }], output_index: 9 }] as never
  } as TransactionInfo);

  // Junk entries drop out. An input with an address but no identifiable source is
  // dropped too: stamping it with the transaction's own hash would forge a
  // self-referential ref and let ref-dedupe collapse distinct inputs.
  assert.equal(normalized.inputs.length, 0);
  // An output legitimately belongs to the transaction, so it keeps the tx's own hash.
  assert.equal(normalized.outputs.length, 1);
  assert.equal(normalized.outputs[0]!.input.txHash, TX_HASH);
  assert.equal(normalized.outputs[0]!.input.outputIndex, 9);
});

function meshInput(sourceHash: string, address: string, lovelace: string) {
  return {
    input: { txHash: sourceHash, outputIndex: 0 },
    output: { address, amount: [{ unit: "lovelace", quantity: lovelace }] }
  };
}

function meshOutput(address: string, lovelace: string) {
  return {
    input: { txHash: TX_HASH, outputIndex: 0 },
    output: { address, amount: [{ unit: "lovelace", quantity: lovelace }] }
  };
}

function meshTransaction(
  inputs: ReturnType<typeof meshInput>[],
  outputs: ReturnType<typeof meshOutput>[],
  overrides: { slot?: string; blockTime?: number } = {}
) {
  return {
    hash: TX_HASH,
    index: 0,
    slot: overrides.slot ?? "100",
    blockTime: overrides.blockTime ?? 1_700_000_100,
    block: "block",
    fees: "150000",
    size: 0,
    deposit: "0",
    invalidBefore: "",
    invalidAfter: "",
    inputs,
    outputs
  } as TransactionInfo;
}

test("a recency tie keeps the more complete payload when one tx arrives from two fetch paths", () => {
  // The address-scoped listing sees only some of the tx's inputs; the by-hash detail
  // carries them all. Same hash, same slot — the partial view must not win the merge,
  // or a 9-in/9-out consolidation is reported as "+9 ₳" and the balance chart doubles.
  const partial = meshTransaction(
    [meshInput("cd".repeat(32), EXTERNAL, "10000000")],
    [meshOutput(WALLET, "9000000"), meshOutput(EXTERNAL, "150000")]
  );
  const complete = meshTransaction(
    [
      meshInput("cd".repeat(32), EXTERNAL, "10000000"),
      meshInput("ab".repeat(32), WALLET, "4000000"),
      meshInput("ef".repeat(32), WALLET, "5000000")
    ],
    [meshOutput(WALLET, "9000000"), meshOutput(EXTERNAL, "150000")]
  );

  const [merged] = mergeAndSortTransactions([[partial], [complete]]);

  assert.equal(merged!.inputs.length, 3);
  assert.equal(merged!.inputs.filter((input) => input.output.address === WALLET).length, 2);
});

test("a newer but partial payload does not replace a more complete one", () => {
  const complete = meshTransaction(
    [
      meshInput("cd".repeat(32), EXTERNAL, "10000000"),
      meshInput("ab".repeat(32), WALLET, "4000000"),
      meshInput("ef".repeat(32), WALLET, "5000000")
    ],
    [meshOutput(WALLET, "9000000"), meshOutput(EXTERNAL, "150000")]
  );
  const partialNewer = meshTransaction(
    [meshInput("cd".repeat(32), EXTERNAL, "10000000")],
    [meshOutput(WALLET, "9000000"), meshOutput(EXTERNAL, "150000")],
    { slot: "200", blockTime: 1_700_000_200 }
  );

  const [merged] = mergeAndSortTransactions([[complete], [partialNewer]]);

  assert.equal(merged!.inputs.length, 3);
});

test("an equally complete newer payload still replaces the older one", () => {
  const older = meshTransaction(
    [meshInput("cd".repeat(32), EXTERNAL, "10000000")],
    [meshOutput(WALLET, "9000000"), meshOutput(EXTERNAL, "150000")],
    { slot: "100", blockTime: 1_700_000_100 }
  );
  const newer = meshTransaction(
    [meshInput("cd".repeat(32), EXTERNAL, "10000000")],
    [meshOutput(WALLET, "9000000"), meshOutput(EXTERNAL, "150000")],
    { slot: "200", blockTime: 1_700_000_200 }
  );

  const [merged] = mergeAndSortTransactions([[older], [newer]]);

  assert.equal(merged!.blockTime, 1_700_000_200);
});
