import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWalletActivityEvents } from "./activity";
import { normalizeTransactionIo } from "./transactions";
import { type Asset } from "@/lib/types/contracts";
import { type TransactionInfo } from "@meshsdk/common";
import { type UTxO } from "@meshsdk/core";

const WALLET = "addr_test1walletaddress";
const EXTERNAL = "addr_test1externaladdress";
const SCRIPT = "addr_test1wscriptaddress"; // starts with addr_test1w -> treated as script
const STT = `${"aa".repeat(28)}53545454`; // arbitrary STT unit

function utxo(
  txHash: string,
  outputIndex: number,
  address: string,
  amount: Asset[]
): UTxO {
  return {
    input: { txHash, outputIndex },
    output: { address, amount }
  };
}

function transaction(
  overrides: Partial<TransactionInfo> & { inputs: UTxO[]; outputs: UTxO[] }
): TransactionInfo {
  return {
    index: 0,
    block: "block",
    hash: "ab".repeat(32),
    slot: "1",
    fees: "0",
    size: 0,
    deposit: "0",
    invalidBefore: "",
    invalidAfter: "",
    ...overrides
  };
}

const lovelace = (quantity: string): Asset[] => [{ unit: "lovelace", quantity }];
const withStt = (quantity: string): Asset[] => [
  { unit: "lovelace", quantity },
  { unit: STT, quantity: "1" }
];

test("returns a 'referenced' event when nothing touches the wallet", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, EXTERNAL, lovelace("5000000"))],
    outputs: [utxo("ab".repeat(32), 0, EXTERNAL, lovelace("4000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.label, "Referenced");
  assert.equal(events[0]!.id, `${tx.hash}:referenced`);
});

test("classifies a pure top-up (only outputs to the wallet) as 'Funds added'", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, EXTERNAL, lovelace("10000000"))],
    outputs: [utxo("ab".repeat(32), 0, WALLET, lovelace("6000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.title, "Funds added");
  assert.equal(events[0]!.label, "Top-up");
});

test("classifies a pure spend (only inputs from the wallet) as 'Funds sent'", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, WALLET, lovelace("6000000"))],
    outputs: [utxo("ab".repeat(32), 0, EXTERNAL, lovelace("5000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.title, "Funds sent");
  assert.equal(events[0]!.label, "Sent");
});

test("spend+send with a net decrease is 'Funds sent'", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, WALLET, lovelace("10000000"))],
    outputs: [utxo("ab".repeat(32), 0, WALLET, lovelace("4000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET);
  assert.equal(events[0]!.title, "Funds sent");
  assert.match(events[0]!.amountSummary, /-6/);
});

test("spend+send with a net increase is 'Funds added'", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, WALLET, lovelace("4000000"))],
    outputs: [utxo("ab".repeat(32), 0, WALLET, lovelace("10000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET);
  assert.equal(events[0]!.title, "Funds added");
  assert.match(events[0]!.amountSummary, /\+6/);
});

test("equal balance with fewer outputs than inputs is a consolidation ('Funds merged')", () => {
  const tx = transaction({
    inputs: [
      utxo("cc".repeat(32), 0, WALLET, lovelace("3000000")),
      utxo("cc".repeat(32), 1, WALLET, lovelace("3000000"))
    ],
    outputs: [utxo("ab".repeat(32), 0, WALLET, lovelace("6000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET);
  assert.equal(events[0]!.title, "Funds merged");
  assert.equal(events[0]!.label, "Tidied");
});

test("equal balance with more outputs than inputs is a split ('Funds split')", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, WALLET, lovelace("6000000"))],
    outputs: [
      utxo("ab".repeat(32), 0, WALLET, lovelace("3000000")),
      utxo("ab".repeat(32), 1, WALLET, lovelace("3000000"))
    ]
  });
  const events = buildWalletActivityEvents(tx, WALLET);
  assert.equal(events[0]!.title, "Funds split");
  assert.equal(events[0]!.label, "Split");
});

test("equal balance and equal utxo counts is 'Funds moved'", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, WALLET, lovelace("6000000"))],
    outputs: [utxo("ab".repeat(32), 0, WALLET, lovelace("6000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET);
  assert.equal(events[0]!.title, "Funds moved");
  assert.equal(events[0]!.label, "Moved");
});

test("STT created (output STT, no input STT) yields Created + initial top-up", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, EXTERNAL, lovelace("10000000"))],
    outputs: [utxo("ab".repeat(32), 0, WALLET, withStt("6000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT });
  // Newest-first feed, one transaction, two same-timestamp events: the top-up a
  // reader is here for leads, the creation follows it.
  assert.deepEqual(
    events.map((event) => event.title),
    ["Initial top-up", "Wallet created"]
  );
});

test("STT touched on both sides (no fund flow) is 'Wallet settings updated'", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, SCRIPT, withStt("2000000"))],
    outputs: [utxo("ab".repeat(32), 0, SCRIPT, withStt("2000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.title, "Wallet settings updated");
  assert.equal(events[0]!.label, "Settings");
});

test("actor is the connected wallet when an active address is an input", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, EXTERNAL, lovelace("10000000"))],
    outputs: [utxo("ab".repeat(32), 0, WALLET, lovelace("6000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET, {
    activeAddress: EXTERNAL,
    activeWalletName: "My wallet"
  });
  assert.equal(events[0]!.actorLabel, "My wallet");
});

test("actor is 'External wallet' when a non-script external input funds the tx", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, EXTERNAL, lovelace("10000000"))],
    outputs: [utxo("ab".repeat(32), 0, WALLET, lovelace("6000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET);
  assert.equal(events[0]!.actorLabel, "External wallet");
});

test("STT consumed but not re-emitted (input STT, no output STT) is 'Wallet token moved'", () => {
  const tx = transaction({
    // STT is spent from a script address and no output carries it, with no
    // fund flow at the wallet address.
    inputs: [utxo("cc".repeat(32), 0, SCRIPT, withStt("2000000"))],
    outputs: [utxo("ab".repeat(32), 0, SCRIPT, lovelace("2000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.title, "Wallet token moved");
  assert.equal(events[0]!.label, "Moved");
});

/**
 * Blockfrost tx-utxos entries arrive raw (`{ address, amount, output_index }`), not in
 * the Mesh shape. Untranslated, this settings update classified as "Referenced /
 * External source" with "no net balance change" — on prod, the transaction that paid a
 * fee and rewrote the wallet rules showed exactly that.
 */
function rawStateUpdate(): TransactionInfo {
  return transaction({
    inputs: [
      {
        address: SCRIPT,
        amount: withStt("2000000"),
        output_index: 0,
        transaction: { hash: "cd".repeat(32), index: 0 }
      },
      {
        address: EXTERNAL,
        amount: lovelace("5000000"),
        output_index: 1,
        transaction: { hash: "cd".repeat(32), index: 1 }
      }
    ] as never,
    outputs: [
      { address: SCRIPT, amount: withStt("2000000"), output_index: 0 },
      { address: EXTERNAL, amount: lovelace("4849905"), output_index: 1 }
    ] as never
  });
}

test("the expanded row's inputs list does not repeat a raw duplicate entry", () => {
  // The raw tx-utxos payload can carry the same input entry twice; the expanded
  // activity row keys its "Inputs used" list by utxo ref, and duplicated entries made
  // React reject the list.
  const duplicated = transaction({
    inputs: [
      utxo("cc".repeat(32), 0, EXTERNAL, lovelace("10000000")),
      utxo("cc".repeat(32), 0, EXTERNAL, lovelace("10000000"))
    ],
    outputs: [utxo("ab".repeat(32), 0, WALLET, lovelace("6000000"))]
  });
  const events = buildWalletActivityEvents(duplicated, WALLET, {});

  assert.equal(events.length, 1);
  const refs = events[0]!.inputUtxos.map((u) => `${u.input.txHash}#${u.input.outputIndex}`);
  assert.equal(refs.length, 1);
  assert.equal(new Set(refs).size, refs.length);
});

test("a raw-shaped settings update reads as referenced; the translated one reads as Settings", () => {
  // The fee's change goes back to the connected wallet, which the caller reports.
  const options = { sttUnit: STT, activeAddress: EXTERNAL };
  const raw = buildWalletActivityEvents(rawStateUpdate(), WALLET, options);
  assert.equal(raw[0]!.label, "Referenced");

  const events = buildWalletActivityEvents(normalizeTransactionIo(rawStateUpdate()), WALLET, options);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.title, "Wallet settings updated");
  assert.equal(events[0]!.label, "Settings");
});

test("the wallet's own state input names the wallet as the actor, not 'External source'", () => {
  // The realistic options: a rule-driven transaction is also funded by an input at
  // the connected address (the fee's change), and the state input still decides the
  // actor — the wallet whose state moved, not whoever paid the fee.
  const events = buildWalletActivityEvents(normalizeTransactionIo(rawStateUpdate()), WALLET, {
    sttUnit: STT,
    activeAddress: EXTERNAL
  });
  assert.equal(events[0]!.actorLabel, "Smart wallet");
  assert.equal(events[0]!.actorDetail, "this wallet's state");
});

test("a state rewrite that also pays an outside address is a send, not a settings edit", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, SCRIPT, withStt("2000000"))],
    outputs: [
      utxo("ab".repeat(32), 0, SCRIPT, withStt("2000000")),
      utxo("ab".repeat(32), 1, EXTERNAL, lovelace("9000000"))
    ]
  });
  const events = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT });
  assert.equal(events[0]!.title, "Funds sent");
  assert.equal(events[0]!.label, "Sent");
});
