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
  collectPayeeStreamingPayments: (...args: unknown[]): PayeeScanResult =>
    chain.scan(...args) as PayeeScanResult
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
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
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

  it("ignores a slower refresh that a newer one has already replaced", async () => {
    // Two rows held in different wallets can be acted on at the same time, so the reload
    // each action ends with can overlap the other. The older reload used to win whenever
    // it landed last, raising a load error over a list a newer read had already returned.
    const mine = payment();
    const other = payment({ streamingPaymentId: 2, sttInputTxHash: "22".repeat(32) });
    const collectDone = deferred<string>();
    const submitDone = deferred<string>();
    const supersededLoad = deferred<{ tokens: ReturnType<typeof detectedTokenFor>[] }>();

    chain.scan.mockReturnValue(scanOf([mine, other]));
    chain.detect
      .mockResolvedValueOnce({ tokens: [detectedTokenFor(mine), detectedTokenFor(other)] })
      .mockReturnValueOnce(supersededLoad.promise)
      .mockResolvedValue({ tokens: [detectedTokenFor(other)] });
    actions.collect.mockReturnValue(collectDone.promise);
    actions.submit.mockReturnValue(submitDone.promise);
    await renderView();

    fireEvent.click(screen.getAllByRole("button", { name: "Collect payment" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Shorten payment" })[1]!);

    // The collect settles first and starts the reload that the next one supersedes.
    await act(async () => collectDone.resolve("ab".repeat(32)));
    // The shorten settles next, and its reload reads the chain cleanly.
    await act(async () => submitDone.resolve("cd".repeat(32)));
    // Only now does the superseded reload fail.
    await act(async () => supersededLoad.reject(new Error("provider timeout")));

    expect(screen.queryByText("Unable to load scheduled payments.")).toBeNull();
  });

  it("keeps a sent transaction sent when the follow-up refresh cannot read the chain", async () => {
    // Both handlers `await loadTokens()` inside the submit try, after the success state is
    // written. That reads like a refresh failure could overwrite it. It cannot: `loadTokens`
    // catches its own read error and reports it as a load error, so the submit catch is
    // never entered. This test holds that apart, because the two failures mean different
    // things: one says the payment did not go through, the other says the list did not.
    const current = payment();
    chain.scan.mockReturnValue(scanOf([current]));
    chain.detect
      .mockResolvedValueOnce({ tokens: [detectedTokenFor(current)] })
      .mockRejectedValue(new Error("provider timeout"));
    await renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Collect payment" }));
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Sent. The list updates after the next refresh."
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load scheduled payments.");
    expect(screen.queryByText("Failed to collect the payment.")).toBeNull();
  });

  it("keeps a sent shorten sent when the follow-up refresh cannot read the chain", async () => {
    const current = payment();
    chain.scan.mockReturnValue(scanOf([current]));
    chain.detect
      .mockResolvedValueOnce({ tokens: [detectedTokenFor(current)] })
      .mockRejectedValue(new Error("provider timeout"));
    await renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Shorten payment" }));
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Sent. The list updates after the next refresh."
    );
    expect(screen.queryByText("Failed to stop the payment.")).toBeNull();
  });

  it("keeps a row locked while the newest read still shows its state input", async () => {
    // Two rows in different wallets, acted on together. The read a reload starts first can
    // return last, so the read that sees row 1's state input spent and the read the view
    // adopts are different reads.
    //
    // The lock and the list have to come from the same read, or they disagree in one of two
    // ways. Free the lock from the superseded read and row 1 stays on screen, from the newest
    // read, with its Shorten link live again over an input its own collect already spends.
    // Remove the row to compensate and a real payment vanishes: a collect respends the state
    // input into a successor that the superseded read holds and the newest read does not.
    //
    // So row 1 stays listed and stays disabled. The newest data still shows its input, which
    // means the collect is not visible on chain yet.
    const mine = payment();
    const other = payment({ streamingPaymentId: 2, sttInputTxHash: "22".repeat(32) });
    const mineToken = detectedTokenFor(mine);
    const otherToken = detectedTokenFor(other);
    const collectDone = deferred<string>();
    const submitDone = deferred<string>();
    const supersededLoad = deferred<{ tokens: ReturnType<typeof detectedTokenFor>[] }>();

    // The rendered rows follow the tokens the view holds, so the assertions read the list
    // itself rather than a scan result pinned in advance.
    chain.scan.mockImplementation((tokens: unknown) =>
      scanOf(
        [mine, other].filter((entry) =>
          (tokens as ReturnType<typeof detectedTokenFor>[]).some(
            (token) => token.utxo.input.txHash === entry.sttInputTxHash
          )
        )
      )
    );
    chain.detect
      .mockResolvedValueOnce({ tokens: [mineToken, otherToken] })
      // The collect's reload: started first, lands last, and is the only read that sees the
      // first row's input spent.
      .mockReturnValueOnce(supersededLoad.promise)
      // The shorten's reload: started second, so it holds the ticket, and lands first. Its
      // read was taken before that spend propagated, so it still carries the first row.
      .mockResolvedValue({ tokens: [mineToken, otherToken] });
    actions.collect.mockReturnValue(collectDone.promise);
    actions.submit.mockReturnValue(submitDone.promise);
    await renderView();

    fireEvent.click(screen.getAllByRole("button", { name: "Collect payment" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Shorten payment" })[1]!);

    await act(async () => collectDone.resolve("ab".repeat(32)));
    await act(async () => submitDone.resolve("cd".repeat(32)));
    await act(async () => supersededLoad.resolve({ tokens: [otherToken] }));

    // Row 1 is still listed. Its collect button carries the post-action label.
    expect(screen.getByRole("button", { name: "Collected" })).toBeInTheDocument();
    // Row 2's link reads "Shortened", so the only "Shorten payment" left is row 1's.
    const shorten = screen.getAllByRole("button", { name: "Shorten payment" });
    expect(shorten).toHaveLength(1);
    expect(shorten[0]).toBeDisabled();
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

  it("says a declined signature was declined, not that the payment failed", async () => {
    // A CIP-30 decline used to read as "Failed to collect the payment.", which describes a
    // broken payment rather than the reader's own choice. Classify before falling back.
    const current = payment();
    chain.scan.mockReturnValue(scanOf([current]));
    chain.detect.mockResolvedValue({ tokens: [detectedTokenFor(current)] });
    actions.collect.mockRejectedValue(
      Object.assign(new Error("user declined sign tx"), { code: 4001 })
    );
    await renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Collect payment" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The request was cancelled in your wallet. Nothing was submitted."
    );
  });

  it("says a declined signature was declined when shortening too", async () => {
    const current = payment();
    chain.scan.mockReturnValue(scanOf([current]));
    chain.detect.mockResolvedValue({ tokens: [detectedTokenFor(current)] });
    actions.submit.mockRejectedValue(
      Object.assign(new Error("user rejected the request"), { code: 4001 })
    );
    await renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Shorten payment" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The request was cancelled in your wallet. Nothing was submitted."
    );
  });

  it("says the wallet could not be re-read, instead of the generic failure", async () => {
    // The row is on screen but its State UTxO is gone from the refreshed scan, so the
    // handler cannot find the datum it must spend. That sentence was thrown as a plain
    // Error, missed the `instanceof` test, and reached the reader as "Failed to collect
    // the payment." with no Refresh instruction in it.
    const current = payment();
    chain.scan.mockReturnValue(scanOf([current]));
    chain.detect.mockResolvedValue({ tokens: [] });
    await renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Collect payment" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The wallet holding this payment could not be read again. Press Refresh and try once more."
    );
    expect(actions.collect).not.toHaveBeenCalled();
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
