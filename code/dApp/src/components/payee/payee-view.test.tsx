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

  it("says what the demo wallet cannot do here", async () => {
    wallet.value = { ...wallet.value, isDemoWallet: true };
    await renderView();

    expect(
      screen.getByText(/demo wallet can look, but it cannot sign/)
    ).toBeInTheDocument();
    expect(screen.getByText(/collect or shorten payments/)).toBeInTheDocument();
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
