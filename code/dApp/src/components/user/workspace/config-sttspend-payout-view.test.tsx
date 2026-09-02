import { render, screen } from "@testing-library/react";
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

function renderPayout(rows: ReturnType<typeof payoutRow>[]) {
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
    selectedAction: "payout-streaming-payment",
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
    setStreamingPaymentPayoutAmounts: vi.fn(),
    setSttAuthorityPath: vi.fn(),
    setSttExtraTransfers: vi.fn(),
    setSttStateForm: vi.fn(),
    setSttZeroAdminConfirmed: vi.fn(),
    sttAuthorityPath: "admin",
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
  return render(
    <Provider store={createStore()}>
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

  it("says the row is not being paid rather than that it was skipped", () => {
    renderPayout([payoutRow()]);

    expect(screen.getByText("Not now")).toBeInTheDocument();
    expect(screen.queryByText("Skipped")).not.toBeInTheDocument();
  });

  it("says a payment with no address has nobody to pay", () => {
    renderPayout([payoutRow({ streamingPayment: { ...payoutRow().streamingPayment, payoutAddress: "" } })]);

    expect(screen.getByText("This payment has nobody to pay.")).toBeInTheDocument();
    expect(screen.queryByText(/No payout address configured/)).not.toBeInTheDocument();
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
