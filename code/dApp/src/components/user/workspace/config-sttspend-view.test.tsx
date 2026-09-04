import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  lockedContractUtxosErrorAtom,
  lockedContractUtxosLoadingAtom
} from "@/components/user/workspace/atoms/workspace-data.atoms";

const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const lockingContract = vi.hoisted(() => ({
  value: { address: null as string | null, error: null as string | null }
}));

// Each editor is a surface of its own (D3, E1-E3, E7, E13); this asks about the send form.
vi.mock("@/components/user/workspace/editors", () => ({
  FocusedPeopleEditor: () => null,
  FocusedStreamingPaymentRulesEditor: () => null,
  // Renders its children so the scheduled-payout rows are reachable.
  FocusedTaskSurface: ({ children }: PropsWithChildren) => <>{children}</>,
  FocusedWalletSettingsEditor: () => null,
  // Faithful in the one respect these tests read: the node exists, carrying the id the
  // control points at, only while there is a message to show.
  InlineFieldError: ({ id, message }: { id?: string; message?: string | null }) =>
    message ? <p id={id}>{message}</p> : null,
  SearchableAssetUnitDropdown: () => <div data-testid="asset-dropdown" />,
  StateFormEditor: () => null
}));
vi.mock("@/components/user/workspace/config-sttspend-editors-view", () => ({
  SttSpendEditorsView: () => null
}));
vi.mock("@/components/user/workspace/use-config-sttspend-state", () => ({
  useConfigSttSpendState: () => state.value
}));

// `suggestedSttAuthorityPathAtom` is derived from the inferred state form and the connected
// key. Swapping it for a writable atom is what lets a test move the automatic pick, which is
// one of the effect dependencies that used to overwrite a manual choice.
vi.mock(
  "@/components/user/workspace/atoms/workspace-stt-options.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      suggestedSttAuthorityPathAtom: atom("admin")
    };
  }
);

// `lockingContractAtom` is derived from the config and runs real address resolution. Swapping
// it for a writable atom is what makes the loading and error branches reachable at all: with a
// null address the view short-circuits before either of them, so tests that only asserted the
// old string was gone would have passed against any branch.
vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      lockingContractAtom: atom(() => lockingContract.value)
    };
  }
);

const { SttSpendConfigView } = await import(
  "@/components/user/workspace/config-sttspend-view"
);

type Overrides = {
  view?: Record<string, unknown>;
  loading?: boolean;
  utxoError?: string | null;
  address?: string | null;
};

function renderView({
  view = {},
  loading = false,
  utxoError = null,
  address = null
}: Overrides = {}) {
  state.value = {
    availableLockedTransferAssets: [],
    availableLockedTransferAssetOptions: [],
    selectedTransferAsset: null,
    streamingPaymentPayoutRows: [],
    streamingPaymentPayoutTransfers: [],
    recentRecipients: [],
    activeAddress: "addr_test1connected",
    activePaymentKeyHash: "hash",
    activeSttActionTab: { label: "Send funds", allowsStateEditing: false },
    activeSttAuthorityOptions: [{ value: "admin", label: "Owner" }],
    effectiveWalletAssetNameHex: "hex",
    resolvedSelectedTask: null,
    selectedAction: "use",
    selectedDetectedToken: { unit: "policy.asset" },
    selectedDetectedTokenStateForm: null,
    selectedIntent: "send",
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
    sttWalletInputs: [],
    sttZeroAdminConfirmed: false,
    setTransferCustomAddress: vi.fn(),
    setTransferDisplayAmount: vi.fn(),
    setTransferRecipientMode: vi.fn(),
    setTransferSelectedUnit: vi.fn(),
    transferCustomAddress: "",
    transferDisplayAmount: "",
    transferRecipientMode: "",
    transferSelectedUnit: "lovelace",
    ...view
  };
  lockingContract.value = {
    address,
    error: address
      ? null
      : "Choose a smart wallet first. Its address comes from the wallet you pick."
  };
  const store = createStore();
  store.set(lockedContractUtxosLoadingAtom, loading);
  store.set(lockedContractUtxosErrorAtom, utxoError);
  return {
    ...render(
      <Provider store={store}>
        <SttSpendConfigView />
      </Provider>
    ),
    store
  };
}

/** Re-render with the same store after `state.value` has moved. */
function rerenderView(
  rerender: (ui: React.ReactElement) => void,
  store: ReturnType<typeof createStore>
) {
  rerender(
    <Provider store={store}>
      <SttSpendConfigView />
    </Provider>
  );
}

/**
 * One message covered four different situations. `refreshLockedContractUtxos` returns an empty
 * list with no error and no loading flag when the wallet address is null
 * (`use-locked-contract-utxos.ts:31-36`), so a wallet that had simply not resolved was reported
 * to the reader as a wallet with no money in it. A failed fetch reads the same way. And the
 * message itself, "Load the locked funds first so the wallet can show available payout assets",
 * told the reader to do something this screen has no control for.
 */
describe("send form, nothing available to send", () => {
  it("says the wallet is not open when its address has not resolved", () => {
    renderView();

    expect(
      screen.getByText("Choose a smart wallet first. Its address comes from the wallet you pick.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/nothing to send yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Load the locked funds first/)).not.toBeInTheDocument();
  });

  it("says it is still reading while the fund pools load", () => {
    renderView({ address: "addr_test1wallet", loading: true });

    expect(screen.getByText("Checking this wallet's funds…")).toBeInTheDocument();
    expect(screen.queryByText(/nothing to send yet/)).not.toBeInTheDocument();
  });

  it("does not report a failed read as an empty wallet", () => {
    renderView({ address: "addr_test1wallet", utxoError: "Could not reach the network." });

    expect(screen.getByText(/Could not reach the network\./)).toBeInTheDocument();
    expect(screen.queryByText(/nothing to send yet/)).not.toBeInTheDocument();
  });

  it("says the wallet is empty only when it really is", () => {
    renderView({ address: "addr_test1wallet" });

    expect(
      screen.getByText("This wallet has nothing to send yet. Add funds to it first.")
    ).toBeInTheDocument();
  });
});

/**
 * The badge row sat under a card header that already names the action and a workspace header
 * that already names the wallet. "This wallet" was a badge whose entire value was a
 * demonstrative pronoun; only its warning twin carried news.
 */
describe("send form badges", () => {
  it("says nothing when a wallet is selected", () => {
    renderView();

    expect(screen.queryByText("This wallet")).not.toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("warns when no wallet is selected", () => {
    renderView({ view: { selectedDetectedToken: null } });

    expect(screen.getByText("Select a smart wallet first")).toBeInTheDocument();
  });
});

/**
 * The intro was four steps in one sentence and ended by naming "Select suggested inputs", a
 * button that lives inside a collapsed Advanced section the reader cannot see yet. The app
 * picks the fund pools on its own, so the last two steps are not the reader's to take.
 */
describe("send form intro", () => {
  it("does not name a control the reader cannot see", () => {
    const { container } = renderView();

    expect(container.textContent).not.toContain("Select suggested inputs");
    expect(
      screen.getByText(/The app chooses which funds to spend from/)
    ).toBeInTheDocument();
  });
});

/**
 * The allowance path is a spender's send screen. It opened with "The connected payment key hash
 * plus the requested spend must resolve to exactly one spender. This mode derives the next STT
 * datum automatically instead of allowing manual state edits", then listed seven tiles including
 * a raw `matchedUserId`, a wallet count, and two different numbers both meaning "what is left".
 */
describe("allowance send", () => {
  const preview = {
    error: null,
    target: {
      matchedUserId: "3",
      matchedUserWallets: ["a", "b"],
      currentRemainingAllowance: [{ unit: "lovelace", quantity: "5000000" }],
      effectiveRemainingAllowance: [{ unit: "lovelace", quantity: "8000000" }],
      nextAllowanceReset: 1_760_000_000_000
    },
    computation: null
  };

  it("explains the allowance without naming the datum or the key hash", () => {
    const { container } = renderView({
      view: { selectedAction: "use-allowance", useAllowancePreview: preview }
    });

    expect(screen.getByText("Your spending limit")).toBeInTheDocument();
    expect(container.textContent).not.toContain("payment key hash");
    expect(container.textContent).not.toContain("STT datum");
  });

  it("drops the tiles a spender cannot act on", () => {
    const { container } = renderView({
      view: { selectedAction: "use-allowance", useAllowancePreview: preview }
    });

    expect(container.textContent).not.toContain("Matched user:");
    expect(container.textContent).not.toContain("Wallets: 2");
    expect(container.textContent).toContain("Matched as: Spender #3");
  });

  it("says what to do instead of that nothing was derived", () => {
    const { container } = renderView({
      view: { selectedAction: "use-allowance", useAllowancePreview: preview }
    });

    expect(container.textContent).not.toContain("Not derived yet");
    expect(screen.getAllByText(/Enter an amount first/).length).toBeGreaterThan(0);
  });
});

describe("scheduled payout amount", () => {
  it("keeps the ADA text being typed instead of formatting it away", () => {
    // The box re-rendered the stored lovelace on every keystroke, so a trailing "."
    // vanished and 1.5 could only be pasted.
    renderView({
      view: {
        selectedAction: "payout-streaming-payment",
        streamingPaymentPayoutRows: [
          {
            cleanupRequired: false,
            configuredAmount: "1500000",
            dueAmount: "2000000",
            unit: "lovelace",
            streamingPayment: {
              id: "7",
              payoutAddress: "addr_test1payee",
              paidOutAmount: "0",
              policyId: "",
              assetName: "",
              amountPerDay: "1000000",
              startDate: "1",
              endDate: "2"
            }
          }
        ]
      }
    });
    const box = screen.getByLabelText(/Payout amount \(ADA\)/) as HTMLInputElement;
    expect(box.value).toBe("1.5");

    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "1." } });
    expect(box.value).toBe("1.");
  });
});

/**
 * One rejection covers the recipient dropdown and the custom address field, and only one of
 * their two error nodes is ever in the document. In custom mode the message renders under the
 * address field, so the dropdown's `aria-describedby` named an id that was not there. A
 * dangling reference is dropped in silence: the dropdown was announced as invalid with no
 * reason given, while the reason sat on the field below it.
 */
describe("recipient rejection descriptions", () => {
  const REJECTION = "Enter an address to send to.";

  function renderRejected(view: Record<string, unknown>) {
    renderView({
      address: "addr_test1contract",
      view: {
        availableLockedTransferAssets: [{ unit: "lovelace" }],
        availableLockedTransferAssetOptions: [{ value: "lovelace", label: "ADA" }],
        addSimpleTransferRecipient: () => ({ field: "recipient", message: REJECTION }),
        ...view
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add payout" }));
  }

  function danglingDescriptions() {
    return Array.from(document.querySelectorAll("[aria-describedby]"))
      .flatMap((element) => element.getAttribute("aria-describedby")!.split(/\s+/))
      .filter((id) => document.getElementById(id) === null);
  }

  it("names no description the page does not carry, in custom mode", () => {
    renderRejected({ transferRecipientMode: "custom", transferCustomAddress: "not-an-address" });

    expect(screen.getByText(REJECTION)).toBeInTheDocument();
    expect(danglingDescriptions()).toEqual([]);
  });

  it("leaves the choice itself unmarked while the fault is in the typed address", () => {
    renderRejected({ transferRecipientMode: "custom", transferCustomAddress: "not-an-address" });

    const select = screen.getByLabelText("Recipient");
    expect(select).not.toHaveAttribute("aria-invalid");
    expect(select).not.toHaveAttribute("aria-describedby");
  });

  it("still describes the dropdown when the fault is the choice", () => {
    renderRejected({ transferRecipientMode: "" });

    const select = screen.getByLabelText("Recipient");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription(REJECTION);
    expect(danglingDescriptions()).toEqual([]);
  });

  /**
   * Only `custom` moves the message off the dropdown. A stored recipient is read back from
   * `localStorage` unvalidated, so it can be rejected as the wrong network or as malformed,
   * and there is no second field on screen to carry that: silencing the dropdown for any
   * chosen mode would drop the message from the page entirely.
   */
  it("keeps describing the dropdown for a recipient chosen from the list", () => {
    renderRejected({ transferRecipientMode: "recent:addr_test1stored" });

    const select = screen.getByLabelText("Recipient");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription(REJECTION);
  });

  it("marks the typed address itself, which is where the fault is", () => {
    renderRejected({ transferRecipientMode: "custom", transferCustomAddress: "not-an-address" });

    const field = screen.getByLabelText("Custom address");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(REJECTION);
  });
});

/**
 * The select carries an override: the automatic pick applies until the reader chooses a
 * path themselves, and only a change of action re-arms it. `authorityPathOverridden` was
 * never set to true, so the flag was dead and the effect re-applied the suggested path on
 * every change to its dependencies — the reader's choice snapped back on its own.
 */
describe("the authorization path select", () => {
  const TWO_PATHS = [
    { value: "admin", label: "Owner" },
    { value: "multisig", label: "Co-signers" }
  ];

  it("applies the automatic pick while the reader has not chosen", () => {
    const setSttAuthorityPath = vi.fn();

    renderView({
      view: { activeSttAuthorityOptions: TWO_PATHS, setSttAuthorityPath }
    });

    expect(setSttAuthorityPath).toHaveBeenCalledWith("admin");
  });

  it("keeps a manual choice when an effect dependency moves afterwards", () => {
    const setSttAuthorityPath = vi.fn();
    const { rerender, store } = renderView({
      view: { activeSttAuthorityOptions: TWO_PATHS, setSttAuthorityPath }
    });

    fireEvent.change(screen.getByLabelText("Authorization path"), {
      target: { value: "multisig" }
    });
    expect(setSttAuthorityPath).toHaveBeenLastCalledWith("multisig");
    setSttAuthorityPath.mockClear();

    // The option list is rebuilt whenever its inputs move — the locked fund pools
    // finishing their read is enough. Same paths, new array, so the effect reruns.
    state.value = {
      ...state.value,
      activeSttAuthorityOptions: TWO_PATHS.map((option) => ({ ...option })),
      sttAuthorityPath: "multisig"
    };
    rerenderView(rerender, store);

    expect(setSttAuthorityPath).not.toHaveBeenCalled();
  });

  /**
   * The option list follows the wallet's capability map, not only the action, so a
   * reconnect that changes the connected key can retire the path the reader chose.
   * Holding the override there would leave the form atom on a path the select cannot
   * show, and the transaction builders read that atom.
   */
  it("drops a manual choice the wallet no longer offers", () => {
    const setSttAuthorityPath = vi.fn();
    const { rerender, store } = renderView({
      view: { activeSttAuthorityOptions: TWO_PATHS, setSttAuthorityPath }
    });

    fireEvent.change(screen.getByLabelText("Authorization path"), {
      target: { value: "multisig" }
    });
    setSttAuthorityPath.mockClear();

    // The connected key lost its co-signer standing; only the owner path is left.
    state.value = {
      ...state.value,
      activeSttAuthorityOptions: [{ value: "admin", label: "Owner" }],
      sttAuthorityPath: "multisig"
    };
    rerenderView(rerender, store);

    expect(setSttAuthorityPath).toHaveBeenCalledWith("admin");
  });

  it("re-arms the automatic pick when the action changes", () => {
    const setSttAuthorityPath = vi.fn();
    const { rerender, store } = renderView({
      view: { activeSttAuthorityOptions: TWO_PATHS, setSttAuthorityPath }
    });

    fireEvent.change(screen.getByLabelText("Authorization path"), {
      target: { value: "multisig" }
    });
    setSttAuthorityPath.mockClear();

    state.value = { ...state.value, selectedAction: "update-state" };
    rerenderView(rerender, store);

    expect(setSttAuthorityPath).toHaveBeenCalledWith("admin");
  });
});
