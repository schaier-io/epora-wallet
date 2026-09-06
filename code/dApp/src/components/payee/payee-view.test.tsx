import { act, fireEvent, render, screen } from "@testing-library/react";
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
  collectPayeeStreamingPayments: (tokens: unknown[]): PayeeScanResult =>
    chain.scan(tokens) as PayeeScanResult
}));
vi.mock("@/components/payee/payee-amounts", () => ({
  computePayeeDueAmount: (): bigint => chain.due() as bigint
}));

import { runPayeeCollect } from "@/components/payee/payee-collect-tx";
import { buildSttSpendTx } from "@/lib/mesh/transactions";
import type { DetectedSttInfo } from "@/lib/mesh/detection";
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

describe("two actions, one wallet UTxO", () => {
  /** The row's own token, so `Collect payment` gets past the re-read guard. */
  function detectionFor(scheduled: PayeeStreamingPayment): DetectedSttInfo {
    return {
      tokens: [
        {
          policyId: scheduled.sttPolicyId,
          assetNameHex: scheduled.sttAssetNameHex,
          unit: `${scheduled.sttPolicyId}${scheduled.sttAssetNameHex}`,
          scriptAddress: "addr_test1script",
          utxo: {
            input: {
              txHash: scheduled.sttInputTxHash,
              outputIndex: scheduled.sttInputOutputIndex
            }
          },
          datum: { alternative: 0, fields: [] }
        }
      ]
    } as unknown as DetectedSttInfo;
  }

  function armRow() {
    const scheduled = payment();
    chain.scan.mockReturnValue(scanOf([scheduled]));
    chain.detect.mockResolvedValue(detectionFor(scheduled));
    return scheduled;
  }

  /**
   * Collect and Shorten spend the same wallet UTxO. `Collect payment` submits,
   * the page re-reads before that transaction is on chain, so the row still
   * carries the input that was just spent. Shorten then built against it and
   * the node rejected the transaction.
   */
  it("stops Shorten after Collect spends the input", async () => {
    armRow();
    vi.mocked(runPayeeCollect).mockResolvedValue("cc".repeat(32));

    await renderView();
    expect(screen.getByRole("button", { name: "Shorten payment" })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Collect payment" }));
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByRole("button", { name: "Collected" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Shorten payment" })).toBeDisabled();
  });

  /** The same hole in the other direction, while the shorten is still in flight. */
  it("stops Collect while a Shorten is in flight", async () => {
    armRow();
    vi.mocked(buildSttSpendTx).mockReturnValue(new Promise<never>(() => {}));

    await renderView();
    expect(screen.getByRole("button", { name: "Collect payment" })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Shorten payment" }));
    });

    expect(screen.getByRole("button", { name: "Shortening…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Collect payment" })).toBeDisabled();
  });
});

describe("two reads in flight at once", () => {
  /** Tokens named so the rows they produce can be told apart on screen. */
  function detectionOf(names: string[]): DetectedSttInfo {
    return {
      tokens: names.map((name, index) => ({
        policyId: "aa".repeat(28),
        assetNameHex: "01",
        unit: name,
        scriptAddress: "addr_test1script",
        utxo: { input: { txHash: `${index + 1}${index + 1}`.repeat(32), outputIndex: 0 } },
        datum: { alternative: 0, fields: [] }
      }))
    } as unknown as DetectedSttInfo;
  }

  /**
   * Every payee action starts its own read when it lands, and one page can hold
   * several payments. Two of those reads overlapped, the earlier one answered
   * last, and the page put its stale payment list back.
   */
  it("ignores an earlier read that answers last", async () => {
    const answers: ((info: DetectedSttInfo) => void)[] = [];
    chain.detect.mockImplementation(
      () =>
        new Promise<DetectedSttInfo>((resolve) => {
          answers.push(resolve);
        })
    );
    chain.scan.mockImplementation((tokens: unknown) =>
      scanOf(
        (tokens as { unit: string; utxo: { input: { txHash: string } } }[]).map(
          (token, index) =>
            payment({
              streamingPaymentId: index + 1,
              payerWalletName: token.unit,
              sttInputTxHash: token.utxo.input.txHash
            })
        )
      )
    );
    const collected: ((txHash: string) => void)[] = [];
    vi.mocked(runPayeeCollect).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          collected.push(resolve);
        })
    );

    await renderView();
    await act(async () => {
      answers[0]!(detectionOf(["Alpha wallet", "Beta wallet"]));
      await vi.runOnlyPendingTimersAsync();
    });

    // Each row keeps its own action state, so both collects run at once.
    await act(async () => {
      const buttons = screen.getAllByRole("button", { name: "Collect payment" });
      fireEvent.click(buttons[0]!);
      fireEvent.click(buttons[1]!);
      await vi.runOnlyPendingTimersAsync();
    });
    expect(collected).toHaveLength(2);

    // Each collect starts its own read when it lands.
    await act(async () => {
      collected[0]!("cc".repeat(32));
      collected[1]!("dd".repeat(32));
      await vi.runOnlyPendingTimersAsync();
    });
    expect(answers).toHaveLength(3);

    await act(async () => {
      answers[2]!(detectionOf(["Newest wallet"]));
      answers[1]!(detectionOf(["Stale wallet"]));
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByText(/Newest wallet/)).toBeInTheDocument();
    expect(screen.queryByText(/Stale wallet/)).toBeNull();
  });
});
