import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWalletActivityEvents } from "./activity";
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
  assert.deepEqual(
    events.map((event) => event.title),
    ["Wallet created", "Initial top-up"]
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

test("STT consumed but not re-emitted (input STT, no output STT) is 'Wallet identity moved'", () => {
  const tx = transaction({
    // STT is spent from a script address and no output carries it, with no
    // fund flow at the wallet address.
    inputs: [utxo("cc".repeat(32), 0, SCRIPT, withStt("2000000"))],
    outputs: [utxo("ab".repeat(32), 0, SCRIPT, lovelace("2000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.title, "Wallet identity moved");
  assert.equal(events[0]!.label, "Moved");
});
