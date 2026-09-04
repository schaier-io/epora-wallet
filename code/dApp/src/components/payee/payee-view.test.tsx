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
const actions = vi.hoisted(() => ({
  build: vi.fn(),
  collect: vi.fn(),
  submit: vi.fn()
}));

vi.mock("@/providers/wallet-provider", () => ({ useWalletContext: () => wallet.value }));
vi.mock("@/lib/mesh/detection", () => ({ detectSttInfo: chain.detect }));
vi.mock("@/lib/mesh/transactions", () => ({
  buildSttSpendTx: actions.build,
  signAndSubmitTx: actions.submit,
  getValidityWindow: (nowMs: number) => ({
    earliestTimeMs: nowMs,
    latestTimeMs: nowMs + 60_000
  })
}));
vi.mock("@/components/payee/payee-collect-tx", () => ({
  PayeeCollectBlockedError: class PayeeCollectBlockedError extends Error {},
  runPayeeCollect: actions.collect
}));
vi.mock("@/components/payee/collect-payee-streaming-payments", () => ({
  collectPayeeStreamingPayments: (): PayeeScanResult => chain.scan() as PayeeScanResult
}));
vi.mock("@/components/payee/payee-amounts", () => ({
  computePayeeDueAmount: (): bigint => chain.due() as bigint
}));

import { PayeeView } from "@/components/payee/payee-view";
import { PayeeCollectBlockedError } from "@/components/payee/payee-collect-tx";

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

function detectedTokenFor(value: PayeeStreamingPayment) {
  return {
    utxo: {
      input: { txHash: value.sttInputTxHash, outputIndex: value.sttInputOutputIndex }
    },
    datum: { alternative: 0, fields: [] },
    policyId: value.sttPolicyId,
    assetNameHex: value.sttAssetNameHex
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
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
  actions.build.mockReset();
  actions.build.mockResolvedValue({ txHex: "84a0" });
  actions.collect.mockReset();
  actions.collect.mockResolvedValue("ab".repeat(32));
  actions.submit.mockReset();
  actions.submit.mockResolvedValue("cd".repeat(32));
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

  it("keeps an exact native-token amount above Number.MAX_SAFE_INTEGER", async () => {
    chain.scan.mockReturnValue(
      scanOf([payment({ policyId: "bb".repeat(28), assetName: "0014df105553444d" })])
    );
    chain.due.mockReturnValue("27021597764222973");
    await renderView();

    expect(screen.getByText(/27,021,597,764,222,973 USDM/)).toBeInTheDocument();
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

  it("blocks a sibling stream that spends the same State UTxO", async () => {
    const first = payment();
    const sibling = payment({ streamingPaymentId: 2 });
    const pending = deferred<string>();
    chain.scan.mockReturnValue(scanOf([first, sibling]));
    chain.detect.mockResolvedValue({ tokens: [detectedTokenFor(first)] });
    actions.collect.mockReturnValue(pending.promise);
    await renderView();

    const collectButtons = screen.getAllByRole("button", { name: "Collect payment" });
    fireEvent.click(collectButtons[0]!);
    fireEvent.click(collectButtons[1]!);

    expect(actions.collect).toHaveBeenCalledTimes(1);
    expect(collectButtons[1]).toBeDisabled();
    await act(async () => pending.resolve("ab".repeat(32)));
  });

  it("blocks Shorten while Collect spends the same State UTxO", async () => {
    const current = payment();
    const pending = deferred<string>();
    chain.scan.mockReturnValue(scanOf([current]));
    chain.detect.mockResolvedValue({ tokens: [detectedTokenFor(current)] });
    actions.collect.mockReturnValue(pending.promise);
    await renderView();

    fireEvent.click(screen.getByRole("button", { name: "Collect payment" }));
    fireEvent.click(screen.getByRole("button", { name: "Shorten payment" }));

    expect(actions.collect).toHaveBeenCalledTimes(1);
    expect(actions.build).not.toHaveBeenCalled();
    await act(async () => pending.resolve("ab".repeat(32)));
  });

  it("keeps the State input locked while a refresh still returns that input", async () => {
    const first = payment();
    const sibling = payment({ streamingPaymentId: 2 });
    const token = detectedTokenFor(first);
    const refresh = deferred<{ tokens: ReturnType<typeof detectedTokenFor>[] }>();
    const lockProbe = deferred<void>();
    chain.scan.mockReturnValue(scanOf([first, sibling]));
    chain.detect.mockResolvedValue({ tokens: [token] }).mockResolvedValueOnce({ tokens: [token] });
    await renderView();

    const collectButtons = screen.getAllByRole("button", { name: "Collect payment" });
    const siblingButton = collectButtons[1] as HTMLButtonElement;
    const propsKey = Object.keys(siblingButton).find((key) => key.startsWith("__reactProps$"));
    expect(propsKey).toBeDefined();
    const siblingProps = (
      siblingButton as unknown as Record<string, { onClick?: () => void }>
    )[propsKey!];
    expect(siblingProps?.onClick).toBeTypeOf("function");
    chain.detect.mockImplementationOnce(() => {
      queueMicrotask(() => {
        siblingProps.onClick!();
        lockProbe.resolve();
      });
      return refresh.promise;
    });
    fireEvent.click(collectButtons[0]!);
    await act(async () => lockProbe.promise);

    expect(actions.collect).toHaveBeenCalledTimes(1);

    await act(async () => refresh.resolve({ tokens: [token] }));
    const refreshedButton = screen.getByRole("button", { name: "Collect payment" });
    expect(refreshedButton).toBeDisabled();
    fireEvent.click(refreshedButton);
    expect(actions.collect).toHaveBeenCalledTimes(1);
  });

  it("keeps a submitted input locked through a failed refresh until a later scan proves it absent", async () => {
    const first = payment();
    const sibling = payment({ streamingPaymentId: 2 });
    const token = detectedTokenFor(first);
    chain.scan.mockReturnValue(scanOf([first, sibling]));
    chain.detect
      .mockResolvedValueOnce({ tokens: [token] })
      .mockRejectedValueOnce(new Error("indexer unavailable"))
      .mockResolvedValueOnce({ tokens: [token] })
      .mockResolvedValueOnce({ tokens: [] });
    await renderView();

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Collect payment" })[0]!);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load scheduled payments.");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    });
    expect(screen.getByRole("button", { name: "Collect payment" })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    });
    expect(screen.getByRole("button", { name: "Collect payment" })).toBeEnabled();
  });

  it("keeps the success announcement when refresh removes the settled row", async () => {
    const current = payment();
    const token = detectedTokenFor(current);
    const refresh = deferred<{ tokens: ReturnType<typeof detectedTokenFor>[] }>();
    chain.scan.mockReturnValue(scanOf([current]));
    chain.detect
      .mockResolvedValueOnce({ tokens: [token] })
      .mockReturnValueOnce(refresh.promise);
    await renderView();

    fireEvent.click(screen.getByRole("button", { name: "Collect payment" }));
    await act(async () => Promise.resolve());
    chain.scan.mockReturnValue(scanOf([]));
    await act(async () => refresh.resolve({ tokens: [] }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Sent. The list updates after the next refresh."
    );
    expect(screen.queryByRole("button", { name: "Collect payment" })).toBeNull();
  });

  it("shows a known collection refusal reason", async () => {
    const current = payment();
    chain.scan.mockReturnValue(scanOf([current]));
    chain.detect.mockResolvedValue({ tokens: [detectedTokenFor(current)] });
    actions.collect.mockRejectedValue(
      new PayeeCollectBlockedError("The paying wallet holds 12 USDM of the 38 USDM owed.")
    );
    await renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Collect payment" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The paying wallet holds 12 USDM of the 38 USDM owed."
    );
    expect(screen.getByRole("button", { name: "Collect payment" })).toBeEnabled();
  });

  it("keeps an unknown collection failure generic", async () => {
    const current = payment();
    chain.scan.mockReturnValue(scanOf([current]));
    chain.detect.mockResolvedValue({ tokens: [detectedTokenFor(current)] });
    actions.collect.mockRejectedValue(new Error("secret provider response"));
    await renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Collect payment" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to collect the payment.");
    expect(screen.queryByText(/secret provider response/)).toBeNull();
  });

  it("announces a successful action through a polite status region", async () => {
    const current = payment();
    chain.scan.mockReturnValue(scanOf([current]));
    chain.detect.mockResolvedValue({ tokens: [detectedTokenFor(current)] });
    await renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Collect payment" }));
    });

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Sent. The list updates after the next refresh.");
  });
});

/**
 * `/payee` holds one card, and its title names the page. The page used to add a hidden `h1`
 * with the same words above it, so a screen reader announced "Scheduled payments to you" at
 * level 1 and again at level 3, with level 2 missing in between.
 */
describe("the page heading", () => {
  it("names the page once, at the top level", () => {
    chain.scan.mockReturnValue({ payments: [], errors: [] });
    render(<PayeeView />);

    const named = screen.getAllByRole("heading", { name: "Scheduled payments to you" });
    expect(named).toHaveLength(1);
    expect(named[0]!.tagName).toBe("H1");
  });
});
