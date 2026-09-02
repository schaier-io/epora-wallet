import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PayeeScanResult,
  PayeeStreamingPayment
} from "@/components/payee/collect-payee-streaming-payments";

const NOW = 1_760_000_000_000;

const wallet = vi.hoisted(() => ({
  value: {
    activeWallet: {},
    activeAddress: "addr_test1real",
    activePaymentKeyHash: "aa".repeat(28),
    isDemoWallet: false,
    networkId: 0
  } as Record<string, unknown>
}));
const chain = vi.hoisted(() => ({ detect: vi.fn(), scan: vi.fn(), due: vi.fn() }));

vi.mock("@/providers/wallet-provider", () => ({ useWalletContext: () => wallet.value }));
vi.mock("@/lib/mesh/detection", () => ({ detectSttInfo: chain.detect }));
vi.mock("@/lib/mesh/transactions", () => ({
  buildSttSpendTx: vi.fn(),
  signAndSubmitTx: vi.fn(),
  getValidityWindow: (nowMs: number) => ({
    earliestTimeMs: nowMs,
    latestTimeMs: nowMs + 60_000
  })
}));
vi.mock("@/components/payee/payee-collect-tx", () => ({ runPayeeCollect: vi.fn() }));
vi.mock("@/components/payee/collect-payee-streaming-payments", () => ({
  collectPayeeStreamingPayments: (): PayeeScanResult => chain.scan() as PayeeScanResult
}));
vi.mock("@/components/payee/payee-amounts", () => ({
  computePayeeDueAmount: (): bigint => chain.due() as bigint
}));

import { PayeeView } from "@/components/payee/payee-view";

function payment(overrides: Partial<PayeeStreamingPayment> = {}): PayeeStreamingPayment {
  return {
    streamingPaymentId: 1,
    policyId: "",
    assetName: "",
    amountPerDay: 5_000_000,
    startDate: NOW - 86_400_000,
    endDate: NOW + 86_400_000,
    paidOutAmount: 0,
    payerWalletName: "Alice",
    payoutAddress: "addr_test1payee",
    lastNonAdminPayoutAt: null,
    sttInputTxHash: "11".repeat(32),
    sttInputOutputIndex: 0,
    sttPolicyId: "aa".repeat(28),
    sttAssetNameHex: "01",
    ...overrides
  };
}

function scanOf(payments: PayeeStreamingPayment[]): PayeeScanResult {
  return { payments, walletsScanned: 1, walletsUnreadable: 0, entriesSkipped: 0 };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  wallet.value = {
    activeWallet: {},
    activeAddress: "addr_test1real",
    activePaymentKeyHash: "aa".repeat(28),
    isDemoWallet: false,
    networkId: 0
  };
  chain.detect.mockReset();
  chain.detect.mockResolvedValue({ tokens: [] });
  chain.scan.mockReset();
  chain.scan.mockReturnValue(scanOf([]));
  chain.due.mockReset();
  chain.due.mockReturnValue(1_000_000n);
});

async function renderView() {
  const result = render(<PayeeView />);
  await vi.runOnlyPendingTimersAsync();
  return result;
}

describe("who this page is for", () => {
  /** The description named one of the page's two actions. Collect is the first button. */
  it("names both things the reader can do", async () => {
    await renderView();

    expect(screen.getByText(/Collect what you are owed whenever you like/)).toBeInTheDocument();
    expect(screen.getByText(/never reduces what is already owed/)).toBeInTheDocument();
  });

  /** There is no menu in the top-right. There is a button, and it says Connect. */
  it("names the control that connects a wallet", async () => {
    wallet.value = { ...wallet.value, activeAddress: null };
    await renderView();

    expect(
      screen.getByText(/Use the Connect button at the top of this page/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/top-right/)).toBeNull();
  });

  it("says what the demo wallet cannot do here, in one sentence", async () => {
    wallet.value = { ...wallet.value, isDemoWallet: true };
    await renderView();

    const note = screen.getByText(/demo wallet cannot sign/);
    expect(note).toHaveTextContent(/collect or shorten payments/);
    expect(note.textContent?.trim().split(/\.\s/)).toHaveLength(1);
  });

  it("announces a failed scan", async () => {
    chain.detect.mockRejectedValue(new Error("Chain data is unavailable."));
    await renderView();

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load scheduled payments.");
  });
});

describe("a payment the reader cannot act on yet", () => {
  /** "Shared receiver/payout cooldown" is three internal nouns and no rule. */
  it("says the rule that is holding the buttons, and for how long", async () => {
    chain.scan.mockReturnValue(scanOf([payment({ lastNonAdminPayoutAt: NOW })]));
    await renderView();

    expect(
      screen.getByText(/Somebody other than an owner just acted on this wallet/)
    ).toBeInTheDocument();
    expect(screen.getByText(/allows that once every 30 minutes/)).toBeInTheDocument();
    expect(screen.getByText("On hold")).toBeInTheDocument();
    expect(screen.queryByText("Cooldown")).toBeNull();
  });

  /** "The current safe transaction window" is the tx builder's language. */
  it("says a payment ending inside the transaction window will finish on its own", async () => {
    chain.scan.mockReturnValue(scanOf([payment({ endDate: NOW + 1_000 })]));
    await renderView();

    expect(
      screen.getByText("This payment ends too soon to shorten. It will finish on its own.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/safe transaction window/)).toBeNull();
  });
});

describe("amounts and asset names", () => {
  it("shows a small ADA rate instead of rounding it to zero", async () => {
    // toLocaleString() keeps three decimals, so 400 lovelace a day read "0 ADA / day".
    chain.scan.mockReturnValue(scanOf([payment({ amountPerDay: 400 })]));
    await renderView();

    expect(screen.getByText(/0\.0004 ADA \/ day/)).toBeInTheDocument();
  });

  it("names a token by its decoded asset name, not the datum hex", async () => {
    chain.scan.mockReturnValue(
      scanOf([payment({ policyId: "bb".repeat(28), assetName: "0014df105553444d", amountPerDay: 12 })])
    );
    await renderView();

    expect(screen.getByText(/12 USDM \/ day/)).toBeInTheDocument();
    expect(screen.queryByText(/5553444d/)).toBeNull();
  });
});

describe("the demo wallet", () => {
  /** It used to get the "cannot sign" note instead of the list. It can read; it cannot sign. */
  it("sees the list with the buttons off and one note saying why", async () => {
    wallet.value = { ...wallet.value, isDemoWallet: true };
    chain.scan.mockReturnValue(scanOf([payment()]));
    await renderView();

    expect(screen.getAllByText(/demo wallet cannot sign/)).toHaveLength(1);
    expect(screen.getByText(/From Alice/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collect payment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Shorten payment" })).toBeDisabled();
  });

  it("still sees the empty state", async () => {
    wallet.value = { ...wallet.value, isDemoWallet: true };
    await renderView();

    expect(screen.getByText(/No scheduled payments to this wallet yet/)).toBeInTheDocument();
  });
});

describe("a row", () => {
  /** Shortening cuts the reader's own income. It is a quiet link now, not a red button. */
  it("keeps Shorten out of the way of Collect", async () => {
    chain.scan.mockReturnValue(scanOf([payment()]));
    await renderView();

    const shorten = screen.getByRole("button", { name: "Shorten payment" });
    expect(shorten.className).not.toMatch(/destructive/);
    expect(shorten.className).toMatch(/underline/);
  });

  /** Up to five helper lines used to stack under the buttons. One line, highest priority. */
  it("shows one status line, the cooldown ahead of the nothing-owed note", async () => {
    chain.scan.mockReturnValue(scanOf([payment({ lastNonAdminPayoutAt: NOW })]));
    chain.due.mockReturnValue(0n);
    await renderView();

    expect(screen.getByText(/Somebody other than an owner just acted/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is owed to you yet/)).toBeNull();
  });
});
