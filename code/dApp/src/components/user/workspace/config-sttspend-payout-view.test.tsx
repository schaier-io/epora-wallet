import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { type ReactNode } from "react";

const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

/**
 * `config-sttspend-view.test.tsx` stubs `FocusedTaskSurface` to null, which hides the whole
 * payout surface. This file renders its children so the pay-due rows can be asked about.
 */
vi.mock("@/components/user/workspace/editors", () => ({
  FocusedPeopleEditor: () => null,
  FocusedStreamingPaymentRulesEditor: () => null,
  FocusedTaskSurface: ({
    description,
    children
  }: {
    description?: string;
    children?: ReactNode;
  }) => (
    <div>
      <p>{description}</p>
      {children}
    </div>
  ),
  FocusedWalletSettingsEditor: () => null,
  InlineFieldError: () => null,
  SearchableAssetUnitDropdown: () => null,
  StateFormEditor: () => null
}));
vi.mock("@/components/user/workspace/config-sttspend-editors-view", () => ({
  SttSpendEditorsView: () => null
}));
vi.mock("@/components/user/workspace/use-config-sttspend-state", () => ({
  useConfigSttSpendState: () => state.value
}));
vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      lockingContractAtom: atom(() => ({ address: "addr_test1wallet", error: null }))
    };
  }
);

const { SttSpendConfigView } = await import(
  "@/components/user/workspace/config-sttspend-view"
);
const { sttStateFormAtom } = await import(
  "@/components/user/workspace/atoms/forms/stt-spend-form.atoms"
);
const { lockedContractUtxosLoadingAtom } = await import(
  "@/components/user/workspace/atoms/workspace-data.atoms"
);
const { renderNowMsAtom } = await import(
  "@/components/user/workspace/atoms/workspace-ui.atoms"
);
const { createDefaultStateForm } = await import("@/lib/contracts/state-form");

// Between the fixture row's start and end dates, so an active row is genuinely active.
const NOW = 1_755_000_000_000;
const MINUTE_MS = 60_000;

function payoutRow(overrides: Record<string, unknown> = {}) {
  return {
    unit: "lovelace",
    dueAmount: "2000000",
    configuredAmount: "0",
    cleanupRequired: false,
    streamingPayment: {
      id: "0",
      payoutAddress: "addr_test1payee",
      paidOutAmount: "1500000",
      policyId: "",
      assetName: "",
      amountPerDay: "1000000",
      startDate: "1750000000000",
      endDate: "1760000000000"
    },
    ...overrides
  };
}

// The payout staging setter the tests can observe. The updater is applied
// IMMEDIATELY, as React would: the updater closes over the DOM event, and a
// deferred call would read the controlled input after React restored it
// (checked and value reset to the rendered props).
const stage = { amounts: {} as Record<string, string>, calls: 0 };

function renderPayout(
  rows: ReturnType<typeof payoutRow>[],
  options: {
    renderNowMs?: number;
    lastNonAdminPayoutAtMs?: number;
    sttAuthorityPath?: string;
    lockedContractUtxosLoading?: boolean;
    selectedAction?: string;
  } = {}
) {
  state.value = {
    availableLockedTransferAssets: [],
    availableLockedTransferAssetOptions: [],
    selectedTransferAsset: null,
    streamingPaymentPayoutRows: rows,
    recentRecipients: [],
    activeAddress: "addr_test1connected",
    activePaymentKeyHash: "hash",
    activeSttActionTab: { label: "Pay due", allowsStateEditing: false },
    activeSttAuthorityOptions: [{ value: "admin", label: "Owner" }],
    effectiveWalletAssetNameHex: "hex",
    resolvedSelectedTask: "streaming-payments-pay-due",
    selectedAction: options.selectedAction ?? "payout-streaming-payment",
    selectedDetectedToken: { unit: "policy.asset" },
    selectedDetectedTokenStateForm: null,
    selectedIntent: "pay-streaming-payments",
    useAllowancePreview: { error: null, target: null, computation: null },
    config: { walletPolicyId: "policy" },
    activeFieldErrors: {},
    addSimpleTransferRecipient: vi.fn(),
    flowAvailability: {},
    guidedStreamingPaymentTaskBadges: {},
    guidedStreamingPaymentsDisabledTasks: [],
    handleFocusedTaskSelect: vi.fn(),
    consolidateAuthorityPath: "admin",
    setConsolidateAuthorityPath: vi.fn(),
    setStreamingPaymentPayoutAmounts: vi.fn(
      (update: (current: Record<string, string>) => Record<string, string>) => {
        stage.amounts = update(stage.amounts);
        stage.calls += 1;
      }
    ),
    setSttAuthorityPath: vi.fn(),
    setSttExtraTransfers: vi.fn(),
    setSttStateForm: vi.fn(),
    setSttZeroAdminConfirmed: vi.fn(),
    sttAuthorityPath: options.sttAuthorityPath ?? "user",
    sttExtraTransfers: [],
    sttStateForm: {},
    sttZeroAdminConfirmed: false,
    setTransferCustomAddress: vi.fn(),
    setTransferDisplayAmount: vi.fn(),
    setTransferRecipientMode: vi.fn(),
    setTransferSelectedUnit: vi.fn(),
    transferCustomAddress: "",
    transferDisplayAmount: "",
    transferRecipientMode: "",
    transferSelectedUnit: "lovelace"
  };
  const store = createStore();
  stage.amounts = {};
  stage.calls = 0;
  // The surface refuses to show time-derived states before the display clock
  // seeds; every rendering test wants it seeded.
  store.set(renderNowMsAtom, options.renderNowMs ?? NOW);
  store.set(
    sttStateFormAtom,
    options.lastNonAdminPayoutAtMs === undefined
      ? createDefaultStateForm()
      : {
          ...createDefaultStateForm(),
          lastNonAdminPayoutAt: { alternative: 0, fields: [options.lastNonAdminPayoutAtMs] }
        }
  );
  if (options.lockedContractUtxosLoading) {
    store.set(lockedContractUtxosLoadingAtom, true);
  }
  return render(
    <Provider store={store}>
      <SttSpendConfigView />
    </Provider>
  );
}

describe("what the pay-due surface says it is for", () => {
  it("describes the task rather than the implementation", () => {
    renderPayout([payoutRow()]);

    expect(
      screen.getByText("Pay out what your scheduled payments have built up so far.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/grouped scheduled payment surface/)).not.toBeInTheDocument();
    expect(screen.queryByText(/guided workspace/)).not.toBeInTheDocument();
  });

  it("says you may pay part of what is owed", () => {
    renderPayout([payoutRow()]);

    expect(screen.getByText("Pay out what has built up")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Tick the people you want to pay now. You can pay less than is owed, and the rest stays waiting for them."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/tags the outputs/)).not.toBeInTheDocument();
  });

  it("explains an empty list without naming a token", () => {
    renderPayout([]);

    expect(
      screen.getByText("This wallet has no scheduled payments, so there is nothing to pay out.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/selected token/)).not.toBeInTheDocument();
  });

  it("does not claim the list is empty while the wallet is still being read", () => {
    renderPayout([], { lockedContractUtxosLoading: true });

    expect(
      screen.getByText("Reading this wallet's scheduled payments…")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This wallet has no scheduled payments, so there is nothing to pay out.")
    ).not.toBeInTheDocument();
  });

  it("survives the first paint before the display clock seeds", () => {
    // renderNowMs 0 with a non-admin path must not reach the validity-window
    // math, which rejects an unseeded clock; the surface just renders bare.
    expect(() =>
      renderPayout([], {
        renderNowMs: 0,
        sttAuthorityPath: "user",
        lastNonAdminPayoutAtMs: NOW - MINUTE_MS
      })
    ).not.toThrow();
    expect(
      screen.getByText("This wallet has no scheduled payments, so there is nothing to pay out.")
    ).toBeInTheDocument();
  });
});

describe("one payout row", () => {
  it("does not print the datum type name at the reader", () => {
    renderPayout([payoutRow()]);

    // Counted from one, like the "1 payment" tab badge and the wallet's other lists;
    // the raw on-chain id starts at 0.
    expect(screen.getByText("Scheduled payment 1")).toBeInTheDocument();
    expect(screen.queryByText("StreamingPayment 0")).not.toBeInTheDocument();
  });

  it("numbers the second payment as the second payment", () => {
    const second = payoutRow({
      streamingPayment: { ...payoutRow().streamingPayment, id: "4" }
    });
    renderPayout([payoutRow(), second]);

    expect(screen.getByText("Scheduled payment 1")).toBeInTheDocument();
    expect(screen.getByText("Scheduled payment 2")).toBeInTheDocument();
    expect(screen.queryByText("Scheduled payment 4")).not.toBeInTheDocument();
  });

  /**
   * A bech32 address is one unbroken ~100-character token; without `break-all` it
   * pushed past the row's right edge instead of wrapping (jsdom cannot measure
   * overflow, so the guard is the wrapping class itself).
   */
  it("wraps the payee address instead of letting it overflow the row", () => {
    renderPayout([payoutRow()]);

    const address = screen.getByText("addr_test1payee");
    expect(address.className).toContain("break-all");
  });

  /**
   * The row grid stretched its items, which pulled the one-line "Due now" chip (and the
   * checkbox) to the full height of the labelled amount field beside them; plain
   * `items-center` then left them floating between the label and the input, since the
   * amount field is two lines tall. jsdom cannot measure layout, so the guard is the
   * structure itself: the amount label gets its own row and the chip shares the input's
   * centred row.
   */
  it("puts the due-now chip on the input's line, under the amount label", () => {
    renderPayout([payoutRow()]);

    const chip = screen.getByText(/Due now:/);
    const rowGrid = chip.closest("div.grid");
    expect(rowGrid?.className).toContain("items-center");
    expect(chip.className).toContain("md:row-start-2");
    expect(screen.getByText("Payout amount (ADA)").closest("div")?.className).toContain(
      "md:row-start-1"
    );
  });

  /** The row formatted "Due now" as ADA and the figure beside it as raw lovelace. */
  it("formats what has been paid the same way as what is due", () => {
    renderPayout([payoutRow()]);

    expect(screen.getByText(/Paid so far:/)).toBeInTheDocument();
    expect(screen.getByText(/1\.5 ADA/)).toBeInTheDocument();
    expect(screen.queryByText(/1500000/)).not.toBeInTheDocument();
  });

  it("names the dates the way the other scheduled-payment screens do", () => {
    renderPayout([payoutRow()]);

    expect(screen.getByText(/^Starts:/)).toBeInTheDocument();
    expect(screen.getByText(/^Stops:/)).toBeInTheDocument();
  });

  it("says an untouched payment inside its run is active, not skipped", () => {
    renderPayout([payoutRow()]);

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("Paying now")).not.toBeInTheDocument();
  });

  it("says a payment with no address has nobody to pay", () => {
    renderPayout([payoutRow({ streamingPayment: { ...payoutRow().streamingPayment, payoutAddress: "" } })]);

    expect(screen.getByText("This payment has nobody to pay.")).toBeInTheDocument();
    expect(screen.queryByText(/No payout address configured/)).not.toBeInTheDocument();
  });

  it("announces how many payments this payout will carry, politely", () => {
    const finished = payoutRow({
      cleanupRequired: true,
      streamingPayment: { ...payoutRow().streamingPayment, id: "1" }
    });
    renderPayout([payoutRow(), finished]);

    const summary = screen.getByRole("status");
    expect(summary).toHaveAttribute("aria-live", "polite");
    // The locked-on finished payment counts too: this payout carries it.
    expect(summary).toHaveTextContent("Ticking 1 of 2 scheduled payments for this payout.");
  });

  it("shows what the whole schedule still owes, in the row's asset", () => {
    renderPayout([payoutRow()]);

    expect(screen.getByText(/Still owed:/)).toBeInTheDocument();
    // Same ADA formatting as "Paid so far", never raw lovelace.
    expect(screen.queryByText(/10074074074/)).not.toBeInTheDocument();
  });
});

describe("a payment that has finished", () => {
  /**
   * VERIFIED, `smart-contract/lib/streaming_payments/payout.ak:156-172`: a payment is
   * removed once matured or fully settled, and a settled removal "owes 0". Leaving it in
   * "would wedge the crank for the whole wallet", which is why the box is locked on.
   */
  it("says why its box is ticked and cannot be changed", () => {
    renderPayout([payoutRow({ cleanupRequired: true })]);

    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.getByText("Closing this finished payment")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This payment has paid out everything it owed, so it leaves the wallet with this transaction. Nothing more is sent."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Cleanup")).not.toBeInTheDocument();
    expect(screen.queryByText(/Remove fully settled schedule/)).not.toBeInTheDocument();
  });
});

describe("a payment that has stopped but still owes", () => {
  const endedRow = payoutRow({
    streamingPayment: {
      ...payoutRow().streamingPayment,
      endDate: String(NOW - MINUTE_MS)
    }
  });

  it("shows an Ended badge, not a healthy Active one", () => {
    renderPayout([endedRow]);

    expect(screen.getByText("Ended")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("explains that paying the remainder closes it", () => {
    renderPayout([endedRow]);

    expect(
      screen.getByText(/Stopped on .*\. What it still owes can be paid out/)
    ).toBeInTheDocument();
  });
});

describe("a payment that has not started yet", () => {
  const upcomingRow = payoutRow({
    dueAmount: "0",
    streamingPayment: {
      ...payoutRow().streamingPayment,
      startDate: String(NOW + MINUTE_MS)
    }
  });

  it("shows a Not started badge and says nothing is owed yet", () => {
    renderPayout([upcomingRow]);

    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing is owed yet\. Payouts can start on /)).toBeInTheDocument();
    // The schedule's whole lifetime would read as "owed" here and contradict the
    // sentence above, so the tile is absent for this state.
    expect(screen.queryByText(/Still owed:/)).not.toBeInTheDocument();
  });
});

describe("the tick box and the amount field drive the payout", () => {
  /**
   * VERIFIED, `streamingPaymentPayoutTransfersAtom`: the ticked rows and their
   * configured amounts are exactly what the payout transaction carries, so the
   * handlers below are the transaction's input, not cosmetic state.
   */
  it("ticking a row stages its full due amount", () => {
    renderPayout([payoutRow()]);

    screen.getByRole("checkbox").click();

    expect(stage.calls).toBe(1);
    expect(stage.amounts).toEqual({ "0": "2000000" });
  });

  it("unticking stages nothing for that row", () => {
    renderPayout([payoutRow({ configuredAmount: "2000000" })]);

    screen.getByRole("checkbox").click();

    expect(stage.calls).toBe(1);
    expect(stage.amounts).toEqual({ "0": "0" });
  });

  it("an ADA amount is stored in lovelace, the unit the transaction carries", () => {
    renderPayout([payoutRow()]);

    fireEvent.change(screen.getByLabelText("Payout amount (ADA)"), {
      target: { value: "1.5" }
    });

    expect(stage.calls).toBe(1);
    expect(stage.amounts).toEqual({ "0": "1500000" });
  });

  it("a finished payment's locked box cannot be changed", () => {
    renderPayout([payoutRow({ cleanupRequired: true })]);

    screen.getByRole("checkbox").click();

    expect(stage.calls).toBe(0);
  });

  it("does not let a third positive payment enter one transaction", () => {
    const rows = [0, 1, 2].map((id) =>
      payoutRow({
        configuredAmount: id < 2 ? "1" : "0",
        streamingPayment: { ...payoutRow().streamingPayment, id: String(id) }
      })
    );
    const view = renderPayout(rows);

    expect(screen.getAllByRole("checkbox")[2]).toBeDisabled();
    expect(screen.getAllByLabelText("Payout amount (ADA)")[2]).toBeDisabled();

    view.unmount();
    renderPayout(rows.map((row, index) => (index === 0 ? { ...row, configuredAmount: "0" } : row)));

    expect(screen.getAllByRole("checkbox")[2]).toBeEnabled();
    expect(screen.getAllByLabelText("Payout amount (ADA)")[2]).toBeEnabled();
  });
});

describe("the shared payout cooldown", () => {
  /**
   * VERIFIED, `lib/contracts/crank-cooldown.ts`: a non-admin payout stamps
   * `last_non_admin_payout_at`, and the shared 30-minute gate rejects the next
   * receiver/payout action until it lapses. The surface only *warns*; the builder
   * still enforces the gate, so this changes no transaction behavior.
   */
  it("names the cooldown and the moment the next payout can go out", () => {
    renderPayout([payoutRow()], { lastNonAdminPayoutAtMs: NOW - 10 * MINUTE_MS });

    expect(
      screen.getByText(
        /paid out in the last 30 minutes\. Payouts share one cooldown, so the next one can go out around /
      )
    ).toBeInTheDocument();
  });

  it("stays quiet when the cooldown has lapsed", () => {
    // The note gates on the tx window's lower bound (~2 minutes behind now,
    // `VALIDITY_WINDOW_PAST_MS`), matching the builder, so 33 minutes clears it.
    renderPayout([payoutRow()], { lastNonAdminPayoutAtMs: NOW - 33 * MINUTE_MS });

    expect(screen.queryByText(/paid out in the last 30 minutes/)).not.toBeInTheDocument();
  });

  it("stays quiet on the admin path, which bypasses the cadence gate", () => {
    renderPayout([payoutRow()], {
      lastNonAdminPayoutAtMs: NOW - MINUTE_MS,
      sttAuthorityPath: "admin"
    });

    expect(screen.queryByText(/paid out in the last 30 minutes/)).not.toBeInTheDocument();
  });
});

describe("an empty test wallet on the transfer side", () => {
  it("points at the Preprod faucet instead of stopping at empty", () => {
    renderPayout([], { selectedAction: "use" });

    expect(
      screen.getByText("Get free test ADA from the Preprod faucet")
    ).toHaveAttribute(
      "href",
      "https://docs.cardano.org/cardano-testnets/tools/faucet/"
    );
    expect(
      screen.getByText(/The ADA here is free test money, not real funds\./)
    ).toBeInTheDocument();
    // The guidance must never imply the app takes mainnet funds today.
    expect(screen.queryByText(/mainnet/i)).not.toBeInTheDocument();
  });
});
