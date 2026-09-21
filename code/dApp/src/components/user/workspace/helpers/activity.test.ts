import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWalletActivityEvents } from "./activity";
import { normalizeTransactionIo } from "./transactions";
import { type Asset } from "@/lib/types/contracts";
import { type TransactionInfo } from "@meshsdk/common";
import { serializeData, type UTxO } from "@meshsdk/core";
import { createDefaultStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import { bech32Encode } from "@/lib/bech32";

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

function stateCbor(walletName = "Wallet", deadline = "1000") {
  return serializeData(stateFormToDatum({
    ...createDefaultStateForm(), walletName,
    proofOfLifeUnlockTimeMode: "some", proofOfLifeUnlockTime: deadline,
    proofOfLifeIncrementMode: "some", proofOfLifeIncrement: "1000"
  }), "Mesh");
}

function stateChange(inputDatum: string | undefined, outputDatum: string | undefined) {
  const tx = transaction({
    inputs: [
      utxo("cc".repeat(32), 0, SCRIPT, withStt("2000000")),
      utxo("dd".repeat(32), 0, EXTERNAL, lovelace("5000000"))
    ],
    outputs: [
      utxo("ab".repeat(32), 0, SCRIPT, withStt("2000000")),
      utxo("ab".repeat(32), 1, "addr_test1differentchange", lovelace("4800000"))
    ]
  });
  tx.inputs[0]!.output.plutusData = inputDatum;
  tx.outputs[0]!.output.plutusData = outputDatum;
  return tx;
}

test("a settings edit with a different fee-change address is not a payment", () => {
  const [event] = buildWalletActivityEvents(stateChange(stateCbor(), stateCbor("Renamed wallet")), WALLET, { sttUnit: STT });
  assert.equal(event!.label, "Settings");
  assert.equal(event!.amountSummary, "No net balance change");
});

test("a proof-of-life deadline extension is a check-in even with different fee change", () => {
  const [event] = buildWalletActivityEvents(stateChange(stateCbor(), stateCbor("Wallet", "2000")), WALLET, { sttUnit: STT });
  assert.equal(event!.title, "Check-in recorded");
  assert.equal(event!.label, "Check-in");
  assert.equal(event!.amountSummary, "No net balance change");
});

test("missing state data does not turn fee change into a payment or settings claim", () => {
  const [event] = buildWalletActivityEvents(stateChange(undefined, undefined), WALLET, { sttUnit: STT });
  assert.equal(event!.title, "Wallet updated");
  assert.equal(event!.label, "Updated");
});

test("migration between this wallet's stake addresses is a move with zero delta", () => {
  const payment = new Uint8Array(28).fill(0xbb);
  const oldAddress = bech32Encode("addr_test", Uint8Array.of(0x70, ...payment));
  const newAddress = bech32Encode("addr_test", Uint8Array.of(0x10, ...payment, ...new Uint8Array(28).fill(0xcc)));
  const tx = stateChange(stateCbor(), stateCbor());
  tx.inputs.push(utxo("ee".repeat(32), 0, oldAddress, lovelace("6000000")));
  tx.outputs.push(utxo(tx.hash, 2, newAddress, lovelace("6000000")));
  const [event] = buildWalletActivityEvents(tx, newAddress, { sttUnit: STT });
  assert.equal(event!.title, "Funds moved");
  assert.equal(event!.amountSummary, "No net balance change");
});

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

test("STT created with separate starter funds yields initial top-up + Created", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, EXTERNAL, lovelace("10000000"))],
    outputs: [
      utxo("ab".repeat(32), 0, WALLET, withStt("6000000")),
      utxo("ab".repeat(32), 1, WALLET, lovelace("5000000"))
    ]
  });
  const events = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT });
  // Newest-first feed, one transaction, two same-timestamp events: the top-up a
  // reader is here for leads, the creation follows it.
  assert.deepEqual(
    events.map((event) => event.title),
    ["Initial top-up", "Wallet created"]
  );
});

test("STT created alone does not invent an initial top-up", () => {
  // The creation state UTxO is itself an output at the wallet's address, so a
  // "funds arrived" gate read on it would pair every creation with a top-up that
  // never happened. With no output beyond the state UTxO, only the creation emits.
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, EXTERNAL, lovelace("10000000"))],
    outputs: [utxo("ab".repeat(32), 0, WALLET, withStt("6000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT });
  assert.deepEqual(
    events.map((event) => event.title),
    ["Wallet created"]
  );
});

test("state continuation without datums has a neutral category", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, SCRIPT, withStt("2000000"))],
    outputs: [utxo("ab".repeat(32), 0, SCRIPT, withStt("2000000"))]
  });
  const events = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.title, "Wallet updated");
  assert.equal(events[0]!.label, "Updated");
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
        inline_datum: stateCbor(),
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
      { address: SCRIPT, amount: withStt("2000000"), output_index: 0, inline_datum: stateCbor("Renamed wallet") },
      { address: EXTERNAL, amount: lovelace("4849905"), output_index: 1 }
    ] as never
  });
}

test("a repeated wallet-owned UTxO counts once, for sums, tallies, and classification", () => {
  // The raw tx-utxos payload can carry the same input entry twice. Everything the
  // event derives reads the deduped collection: the wallet spends 10 ADA and receives
  // 10 ADA back in two pools, so the row is a split with no net change - not a send
  // with a phantom +10 ADA delta from the doubled input.
  const duplicated = transaction({
    inputs: [
      utxo("cc".repeat(32), 0, WALLET, lovelace("10000000")),
      utxo("cc".repeat(32), 0, WALLET, lovelace("10000000"))
    ],
    outputs: [
      utxo("ab".repeat(32), 0, WALLET, lovelace("4000000")),
      utxo("ab".repeat(32), 1, WALLET, lovelace("6000000"))
    ]
  });
  const events = buildWalletActivityEvents(duplicated, WALLET, {});

  assert.equal(events.length, 1);
  // One pool split into two at equal value. Before the dedupe, the doubled input
  // read as a value increase and pushed this to "Sent".
  assert.equal(events[0]!.label, "Split");
  assert.equal(events[0]!.amountSummary, "No net balance change");
  // The expanded "Inputs used" list carries the entry once, and the tally names one
  // input, not two.
  const refs = events[0]!.inputUtxos.map((u) => `${u.input.txHash}#${u.input.outputIndex}`);
  assert.deepEqual(refs, [`${"cc".repeat(32)}#0`]);
  const funds = events[0]!.details.find((detail) => detail.label === "Wallet funds");
  assert.match(funds?.value ?? "", /1 input and 2 outputs/);
  const transactionTally = events[0]!.details.find((detail) => detail.label === "Transaction");
  assert.match(transactionTally?.value ?? "", /1 input and 2 outputs/);
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

test("a co-signer sees another signer's fee change as a settings update", () => {
  const events = buildWalletActivityEvents(normalizeTransactionIo(rawStateUpdate()), WALLET, {
    sttUnit: STT,
    activeAddress: "addr_test1cosigneraddress"
  });

  assert.equal(events[0]!.title, "Wallet settings updated");
  assert.equal(events[0]!.label, "Settings");
});

test("a current continuing STT output completes partial provider transaction data", () => {
  const tx = transaction({
    inputs: [
      utxo("cc".repeat(32), 0, SCRIPT, withStt("2000000")),
      utxo("dd".repeat(32), 0, EXTERNAL, lovelace("5000000"))
    ],
    outputs: [utxo("ab".repeat(32), 1, EXTERNAL, lovelace("4849905"))]
  });
  tx.inputs[0]!.output.plutusData = stateCbor();
  const continuingState = utxo(tx.hash, 0, SCRIPT, withStt("2000000"));
  continuingState.output.plutusData = stateCbor("Renamed wallet");

  const events = buildWalletActivityEvents(tx, WALLET, {
    sttUnit: STT,
    currentWalletUtxos: [continuingState]
  });

  assert.equal(events[0]!.title, "Wallet settings updated");
  assert.equal(events[0]!.label, "Settings");
});

test("external outputs alone cannot prove a smart-wallet payment", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, SCRIPT, withStt("2000000"))],
    outputs: [
      utxo("ab".repeat(32), 0, SCRIPT, withStt("2000000")),
      utxo("ab".repeat(32), 1, EXTERNAL, lovelace("9000000"))
    ]
  });
  const events = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT });
  assert.equal(events[0]!.title, "Wallet updated");
  assert.equal(events[0]!.label, "Updated");
});

for (const split of [false, true]) {
  test(`state forwarding preserves the ${split ? "split" : "consolidation"} category`, () => {
    const pools = [lovelace("3000000"), lovelace("3000000")];
    const merged = [lovelace("6000000")];
    const tx = transaction({
      inputs: [
        utxo("cc".repeat(32), 0, SCRIPT, withStt("2000000")),
        ...(split ? merged : pools).map((assets, index) =>
          utxo("dd".repeat(32), index, WALLET, assets)),
        utxo("ee".repeat(32), 0, EXTERNAL, lovelace("5000000"))
      ],
      outputs: [
        utxo("ab".repeat(32), 0, SCRIPT, withStt("2000000")),
        ...(split ? pools : merged).map((assets, index) =>
          utxo("ab".repeat(32), index + 1, WALLET, assets)),
        utxo("ab".repeat(32), 3, EXTERNAL, lovelace("4800000"))
      ]
    });
    const [event] = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT });
    assert.equal(event!.title, split ? "Funds split" : "Funds merged");
    assert.equal(event!.amountSummary, "No net balance change");
  });
}

test("a payment to another script wallet is a send", () => {
  const tx = transaction({
    inputs: [
      utxo("cc".repeat(32), 0, SCRIPT, withStt("2000000")),
      utxo("dd".repeat(32), 0, WALLET, lovelace("10000000")),
      utxo("ee".repeat(32), 0, EXTERNAL, lovelace("5000000"))
    ],
    outputs: [
      utxo("ab".repeat(32), 0, SCRIPT, withStt("2000000")),
      utxo("ab".repeat(32), 1, WALLET, lovelace("4000000")),
      utxo("ab".repeat(32), 2, "addr_test1wrecipient", lovelace("6000000")),
      utxo("ab".repeat(32), 3, EXTERNAL, lovelace("4800000"))
    ]
  });
  const [event] = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT });
  assert.equal(event!.title, "Funds sent");
  assert.equal(event!.amountSummary, "-6 ₳");
});

test("adding ADA to the state alone cannot prove a settings change", () => {
  const tx = transaction({
    inputs: [
      utxo("cc".repeat(32), 0, SCRIPT, withStt("2000000")),
      utxo("dd".repeat(32), 0, EXTERNAL, lovelace("5000000"))
    ],
    outputs: [
      utxo("ab".repeat(32), 0, SCRIPT, withStt("3000000")),
      utxo("ab".repeat(32), 1, EXTERNAL, lovelace("3800000"))
    ]
  });
  assert.equal(buildWalletActivityEvents(tx, WALLET, { sttUnit: STT })[0]!.label, "Updated");
});

test("script outputs alone do not identify a state-only action", () => {
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, SCRIPT, withStt("5000000"))],
    outputs: [
      utxo("ab".repeat(32), 0, SCRIPT, withStt("2000000")),
      utxo("ab".repeat(32), 1, "addr_test1wrecipient", lovelace("2800000"))
    ]
  });
  assert.equal(buildWalletActivityEvents(tx, WALLET, { sttUnit: STT })[0]!.label, "Updated");
});

test("partial outputs and current UTxOs use one complete set for amounts and counts", () => {
  const first = utxo("ab".repeat(32), 0, WALLET, lovelace("4000000"));
  const second = utxo("ab".repeat(32), 1, WALLET, lovelace("6000000"));
  const unrelated = utxo("ef".repeat(32), 0, WALLET, lovelace("9000000"));
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, WALLET, lovelace("10000000"))],
    outputs: [first]
  });
  const [event] = buildWalletActivityEvents(tx, WALLET, {
    currentWalletUtxos: [first, second, unrelated]
  });
  assert.equal(event!.title, "Funds split");
  assert.equal(event!.amountSummary, "No net balance change");
  assert.equal(event!.details.find((detail) => detail.label === "Wallet funds")?.value,
    "1 input and 2 outputs");
  assert.deepEqual(event!.outputUtxos, [first, second]);
});

test("duplicate outputs do not change the wallet amount or category", () => {
  const output = utxo("ab".repeat(32), 0, WALLET, lovelace("6000000"));
  const tx = transaction({
    inputs: [utxo("cc".repeat(32), 0, WALLET, lovelace("6000000"))],
    outputs: [output, output]
  });
  const [event] = buildWalletActivityEvents(tx, WALLET);
  assert.equal(event!.title, "Funds moved");
  assert.equal(event!.amountSummary, "No net balance change");
  assert.equal(event!.outputUtxos.length, 1);
});


test("current UTxO datum fills the same provider output without duplicating its value", () => {
  const tx = stateChange(stateCbor(), undefined);
  const current = { ...tx.outputs[0]!, output: {
    ...tx.outputs[0]!.output, plutusData: stateCbor("Renamed wallet")
  } };
  const [event] = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT, currentWalletUtxos: [current] });
  assert.equal(event!.title, "Wallet settings updated");
  assert.equal(event!.outputUtxos.length, 2);
  assert.equal(tx.outputs[0]!.output.plutusData, undefined);
});

test("current UTxO datum does not overwrite an existing provider datum", () => {
  const tx = stateChange(stateCbor(), stateCbor("Wallet", "2000"));
  const current = { ...tx.outputs[0]!, output: {
    ...tx.outputs[0]!.output, plutusData: stateCbor("Renamed wallet")
  } };
  const [event] = buildWalletActivityEvents(tx, WALLET, { sttUnit: STT, currentWalletUtxos: [current] });
  assert.equal(event!.title, "Check-in recorded");
});
