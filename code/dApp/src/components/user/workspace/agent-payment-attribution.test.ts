import assert from "node:assert/strict";
import test from "node:test";

import {
  attributeAgentPayment,
  collectAgentPayments,
  type AgentAttributionInput
} from "./agent-payment-attribution";
import { approximateBlockTimeMsFromSlot } from "./helpers/formatters";
import { bech32Encode } from "@/lib/bech32";
import type { WalletActivityEvent } from "./types";
import { type UTxO } from "@meshsdk/core";

const WALLET_SCRIPT_ADDRESS = "addr_test1wqag3rt979nep968t9wznutfqpmz3r24hpwj9f2mzy30mxqfs0g6y";
const AGENT_KEY = "ab".repeat(28);
const OTHER_AGENT_KEY = "cd".repeat(28);

/** A minimal CIP-19 addr_test address: header 0x60 (key credential, testnet) + key hash. */
function bech32TestAddress(keyHash: string) {
  const bytes = Uint8Array.of(0x60, ...Buffer.from(keyHash, "hex"));
  return bech32Encode("addr_test", bytes);
}

const AGENT_ADDRESS = bech32TestAddress(AGENT_KEY);
const OTHER_AGENT_ADDRESS = bech32TestAddress(OTHER_AGENT_KEY);
const OWNER_ADDRESS = bech32TestAddress("11".repeat(28));
const RECIPIENT_ADDRESS = bech32TestAddress("22".repeat(28));

function utxo(address: string, quantity = "2000000"): UTxO {
  return {
    input: { txHash: "tx".repeat(32), outputIndex: 0 },
    output: { address, amount: [{ unit: "lovelace", quantity }] }
  };
}

function event(overrides: Partial<WalletActivityEvent> = {}): WalletActivityEvent {
  return {
    id: "e1",
    transaction: {
      hash: "ab".repeat(32),
      fees: "168577",
      blockTime: 1_756_000_000
    } as unknown as WalletActivityEvent["transaction"],
    label: "Sent",
    title: "Funds sent",
    badgeClassName: "",
    summary: "Sent funds out.",
    amountSummary: "-3 ADA",
    amountClassName: "",
    actorLabel: "Smart wallet",
    actorDetail: "state",
    details: [],
    inputUtxos: [],
    outputUtxos: [],
    ...overrides
  };
}

function input(overrides: Partial<AgentAttributionInput> = {}): AgentAttributionInput {
  return {
    walletAddress: WALLET_SCRIPT_ADDRESS,
    ownerAddress: OWNER_ADDRESS,
    agents: [{ id: "0", wallets: [AGENT_KEY] }],
    ...overrides
  };
}

test("a payment funded by an agent's wallet attributes to that agent", () => {
  const payment = event({
    inputUtxos: [utxo(AGENT_ADDRESS)],
    outputUtxos: [utxo(RECIPIENT_ADDRESS)]
  });

  assert.deepEqual(attributeAgentPayment(payment, input()), {
    kind: "agent",
    agentId: "0"
  });
});

test("a payment funded only by the connected owner attributes to the owner", () => {
  const payment = event({
    inputUtxos: [utxo(OWNER_ADDRESS)],
    outputUtxos: [utxo(RECIPIENT_ADDRESS)]
  });

  assert.deepEqual(attributeAgentPayment(payment, input()), { kind: "owner" });
});

test("inputs from two different agents refuse to pick one", () => {
  const payment = event({
    inputUtxos: [utxo(AGENT_ADDRESS), utxo(OTHER_AGENT_ADDRESS)],
    outputUtxos: [utxo(RECIPIENT_ADDRESS)]
  });

  assert.deepEqual(attributeAgentPayment(payment, input({
    agents: [
      { id: "0", wallets: [AGENT_KEY] },
      { id: "1", wallets: [OTHER_AGENT_KEY] }
    ]
  })), { kind: "ambiguous", reason: "multiple-agents" });
});

test("script-only inputs leave the payment honestly unattributed", () => {
  const payment = event({
    inputUtxos: [utxo(WALLET_SCRIPT_ADDRESS)],
    outputUtxos: [utxo(RECIPIENT_ADDRESS)]
  });

  assert.deepEqual(attributeAgentPayment(payment, input()), {
    kind: "ambiguous",
    reason: "no-recognized-signer"
  });
});

test("value that never leaves the wallet is internal, not a payment", () => {
  const shuffling = event({
    inputUtxos: [utxo(WALLET_SCRIPT_ADDRESS)],
    outputUtxos: [utxo(WALLET_SCRIPT_ADDRESS)]
  });

  assert.deepEqual(attributeAgentPayment(shuffling, input()), { kind: "internal" });
});

test("a mainnet-shaped input cannot masquerade as a match", () => {
  const payment = event({
    inputUtxos: [utxo("addr1v80vwaq9s0zq3un8qvnf9syt3znwq8cvqpfza5p3rtyvvhsqqv0un")],
    outputUtxos: [utxo(RECIPIENT_ADDRESS)]
  });

  assert.deepEqual(attributeAgentPayment(payment, input()), {
    kind: "ambiguous",
    reason: "no-recognized-signer"
  });
});

test("collectAgentPayments drops internal events and keeps the payment time", () => {
  const payment = event({
    id: "pay-1",
    inputUtxos: [utxo(AGENT_ADDRESS)],
    outputUtxos: [utxo(RECIPIENT_ADDRESS)]
  });
  const internal = event({
    id: "merge-1",
    inputUtxos: [utxo(WALLET_SCRIPT_ADDRESS)],
    outputUtxos: [utxo(WALLET_SCRIPT_ADDRESS)]
  });

  const records = collectAgentPayments([payment, internal], input());

  assert.equal(records.length, 1);
  assert.equal(records[0]?.id, "pay-1");
  assert.equal(records[0]?.occurredAtMs, 1_756_000_000_000);
});

test("a payment without a block time falls back to the slot approximation", () => {
  const fresh = event({
    transaction: {
      hash: "cd",
      fees: "0",
      blockTime: undefined,
      slot: "132574663"
    } as unknown as WalletActivityEvent["transaction"],
    inputUtxos: [utxo(AGENT_ADDRESS)],
    outputUtxos: [utxo(RECIPIENT_ADDRESS)]
  });

  const [record] = collectAgentPayments([fresh], input());

  assert.equal(record?.occurredAtMs, approximateBlockTimeMsFromSlot("132574663"));
});
