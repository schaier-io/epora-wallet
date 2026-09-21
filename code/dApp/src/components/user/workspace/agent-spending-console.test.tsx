import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentSpendingConsole } from "./agent-spending-console";
import { bech32Encode } from "@/lib/bech32";
import { createDefaultStateForm, type UserFormState } from "@/lib/contracts/state-form";
import type { WalletActivityEvent } from "./types";
import type { UTxO } from "@meshsdk/core";

const AGENT_KEY = "ab".repeat(28);
const OWNER_KEY = "11".repeat(28);
const RECIPIENT_KEY = "22".repeat(28);
const WALLET_SCRIPT_ADDRESS = "addr_test1wqag3rt979nep968t9wznutfqpmz3r24hpwj9f2mzy30mxqfs0g6y";
const NOW_MS = 1_000_000_000_000;

/** A minimal CIP-19 addr_test address: header 0x60 (key credential, testnet) + key hash. */
function bech32TestAddress(keyHash: string) {
  return bech32Encode("addr_test", Uint8Array.of(0x60, ...Buffer.from(keyHash, "hex")));
}

const AGENT_ADDRESS = bech32TestAddress(AGENT_KEY);
const OWNER_ADDRESS = bech32TestAddress(OWNER_KEY);
const RECIPIENT_ADDRESS = bech32TestAddress(RECIPIENT_KEY);

function spender(overrides: Partial<UserFormState>): UserFormState {
  return {
    id: "0",
    wallets: [],
    perDayAllowance: [],
    remainingAllowance: [],
    nextAllowanceReset: "0",
    canRenewProofOfLife: false,
    multiSigPowerMode: "none",
    multiSigPower: "",
    isAdmin: false,
    preset: "custom",
    ...overrides
  };
}

function utxo(address: string, quantity = "2000000"): UTxO {
  return {
    input: { txHash: "tx".repeat(32), outputIndex: 0 },
    output: { address, amount: [{ unit: "lovelace", quantity }] }
  };
}

function paymentEvent(overrides: Partial<WalletActivityEvent> = {}): WalletActivityEvent {
  return {
    id: "pay-1",
    transaction: {
      hash: "cd".repeat(32),
      fees: "168577",
      blockTime: 1_756_000_000
    } as unknown as WalletActivityEvent["transaction"],
    label: "Sent",
    title: "Funds sent",
    badgeClassName: "",
    summary: "Sent funds out.",
    amountSummary: "-3 ₳",
    amountClassName: "",
    actorLabel: "Smart wallet",
    actorDetail: "state",
    details: [],
    inputUtxos: [],
    outputUtxos: [],
    ...overrides
  };
}

function agentPayment() {
  return paymentEvent({
    inputUtxos: [utxo(AGENT_ADDRESS)],
    outputUtxos: [utxo(RECIPIENT_ADDRESS)]
  });
}

function renderConsole({
  state = createDefaultStateForm(),
  events = [],
  eventsLoading = false,
  onChangeAccess = vi.fn()
}: {
  state?: ReturnType<typeof createDefaultStateForm>;
  events?: WalletActivityEvent[];
  eventsLoading?: boolean;
  onChangeAccess?: () => void;
} = {}) {
  return render(
    <AgentSpendingConsole
      state={state}
      events={events}
      eventsLoading={eventsLoading}
      walletAddress={WALLET_SCRIPT_ADDRESS}
      ownerAddress={OWNER_ADDRESS}
      nowMs={NOW_MS}
      onChangeAccess={onChangeAccess}
    />
  );
}

describe("AgentSpendingConsole", () => {
  it("shows the empty state with a path into the settings flow", () => {
    const onChangeAccess = vi.fn();
    renderConsole({ onChangeAccess });

    expect(screen.getByText("No agent spending is configured")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set up agent spending" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Agent spending/ }));
    const button = screen.getByRole("button", { name: "Set up agent spending" });
    fireEvent.click(button);
    expect(onChangeAccess).toHaveBeenCalledTimes(1);
  });

  it("shows budget state and an attributed agent payment", () => {
    const state = createDefaultStateForm();
    state.users = [
      spender({
        id: "5",
        wallets: [AGENT_KEY],
        perDayAllowance: [{ policyId: "", assetName: "", amount: "12" }],
        remainingAllowance: [{ policyId: "", assetName: "", amount: "7.5" }],
        nextAllowanceReset: String(NOW_MS + 3_600_000)
      })
    ];
    renderConsole({ state, events: [agentPayment()] });

    expect(screen.getByText("Agent record #5")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Daily limit")).toBeInTheDocument();
    expect(screen.getByText("12 ₳")).toBeInTheDocument();
    expect(screen.getByText("7.5 ₳")).toBeInTheDocument();
    expect(screen.getByText("4.5 ₳")).toBeInTheDocument();

    // The payment history starts collapsed; open it to read the attributed rows.
    fireEvent.click(screen.getByText("Attributed payments"));
    expect(screen.getByText("-3 ₳")).toBeInTheDocument();
    expect(screen.getAllByText("Agent record #5").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Attribution unclear")).not.toBeInTheDocument();
  });

  it("labels a payment funded by the owner's own allowance record as owner", () => {
    const state = createDefaultStateForm();
    state.users = [
      spender({
        id: "7",
        isAdmin: true,
        wallets: [OWNER_KEY],
        perDayAllowance: [{ policyId: "", assetName: "", amount: "12" }],
        remainingAllowance: [{ policyId: "", assetName: "", amount: "7.5" }],
        nextAllowanceReset: String(NOW_MS + 3_600_000)
      })
    ];
    renderConsole({
      state,
      events: [
        paymentEvent({
          id: "pay-3",
          inputUtxos: [utxo(OWNER_ADDRESS)],
          outputUtxos: [utxo(RECIPIENT_ADDRESS)]
        })
      ]
    });

    fireEvent.click(screen.getByText("Attributed payments"));
    // The record matched the admin-tagged entry, so the agent wording would
    // overclaim who spent; the chip names the owner instead. Before this
    // label existed nowhere in the console, so its presence pins the branch.
    expect(screen.getByText("Owner payment (record #7)")).toBeInTheDocument();
  });

  it("labels an exhausted budget and keeps ambiguous payments explicit", () => {
    const state = createDefaultStateForm();
    state.users = [
      spender({
        id: "6",
        perDayAllowance: [{ policyId: "", assetName: "", amount: "10" }],
        remainingAllowance: [{ policyId: "", assetName: "", amount: "0" }],
        nextAllowanceReset: String(NOW_MS + 60_000)
      })
    ];
    renderConsole({
      state,
      events: [
        paymentEvent({
          id: "pay-2",
          inputUtxos: [utxo(WALLET_SCRIPT_ADDRESS)],
          outputUtxos: [utxo(RECIPIENT_ADDRESS)]
        })
      ]
    });

    expect(screen.getByText("Budget spent")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Attributed payments"));
    expect(screen.getByText("Attribution unclear")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No agent or owner credential is visible among the paying inputs, so the spender cannot be named."
      )
    ).toBeInTheDocument();
  });

  it("shows the loading state while payment history loads", () => {
    renderConsole({ eventsLoading: true });
    fireEvent.click(screen.getByRole("button", { name: /Agent spending/ }));

    fireEvent.click(screen.getByText("Attributed payments"));
    expect(screen.getByText("Loading payment history.")).toBeInTheDocument();
  });

  it("shows a due refill as available again with the full per-day amount", () => {
    const state = createDefaultStateForm();
    state.users = [
      spender({
        id: "7",
        perDayAllowance: [{ policyId: "", assetName: "", amount: "10" }],
        remainingAllowance: [{ policyId: "", assetName: "", amount: "1" }],
        nextAllowanceReset: String(NOW_MS - 1)
      })
    ];
    renderConsole({ state });

    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Refills with the next payment.")).toBeInTheDocument();
    // Limit and effective remaining both read the refilled per-day amount.
    expect(screen.getAllByText("10 ₳").length).toBe(2);
  });
});
