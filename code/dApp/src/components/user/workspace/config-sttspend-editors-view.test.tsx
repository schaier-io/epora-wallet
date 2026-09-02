import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import {
  lockedContractUtxosAtom,
  lockedContractUtxosErrorAtom,
  lockedContractUtxosLoadingAtom
} from "@/components/user/workspace/atoms/workspace-data.atoms";

const holder = vi.hoisted(() => ({
  selectedAction: "use" as string,
  tab: {} as Record<string, unknown>,
  lockingContract: { address: null as string | null, error: null as string | null },
  increment: undefined as number | null | undefined,
  unlockTime: undefined as number | null | undefined,
  sttWalletInputs: [] as Array<{ txHash: string; outputIndex: number }>,
  refreshLockedContractUtxos: vi.fn()
}));

// The selector, the manual ref editor, and the date field are surfaces of their own (E11,
// E12). Stubbing them keeps this test on the strings and the chrome this file owns, while
// still exposing the `helper`, `error`, and `onRefresh` props the view passes down.
vi.mock("@/components/user/workspace/editors", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  GuidedLockedUtxoSelector: ({
    helper,
    error,
    onRefresh
  }: {
    helper: string;
    error?: string | null;
    onRefresh?: () => void;
  }) => (
    <div>
      <p data-testid="selector-helper">{helper}</p>
      {error ? <p data-testid="selector-error">{error}</p> : null}
      {error && onRefresh ? (
        <button type="button" onClick={onRefresh}>
          Refresh funds
        </button>
      ) : null}
    </div>
  ),
  GuidedDateTimeField: ({ helper }: { helper?: string }) => (
    <p data-testid="date-helper">{helper}</p>
  ),
  WalletInputRefsEditor: ({ label, helper }: { label: string; helper?: string }) => (
    <div>
      <p>{label}</p>
      <p>{helper}</p>
    </div>
  ),
  InlineFieldError: () => null
}));

vi.mock(
  "@/components/user/workspace/atoms/workspace-selection.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      selectedActionAtom: atom(() => holder.selectedAction)
    };
  }
);

vi.mock(
  "@/components/user/workspace/atoms/workspace-stt-options.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      activeSttActionTabAtom: atom(() => holder.tab)
    };
  }
);

vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      lockingContractAtom: atom(() => holder.lockingContract),
      sttProofOfLifeIncrementAtom: atom(() => holder.increment),
      sttProofOfLifeUnlockTimeAtom: atom(() => holder.unlockTime)
    };
  }
);

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    activeFieldErrors: {},
    addLockedContractInputRef: vi.fn(),
    addSttTransferRecipient: vi.fn(),
    applySuggestedLockedInputs: vi.fn(),
    refreshLockedContractUtxos: holder.refreshLockedContractUtxos,
    updateSttTransferAmount: vi.fn()
  })
}));

vi.mock("@/components/user/workspace/forms/use-consolidate-form", () => ({
  useConsolidateForm: () => ({
    consolidateWalletInputs: [],
    setConsolidateWalletInputs: vi.fn()
  })
}));

vi.mock("@/components/user/workspace/forms/use-stt-spend-form", () => ({
  useSttSpendForm: () => ({
    setSttProofOfLifeOverrideMode: vi.fn(),
    setSttProofOfLifeSpecificDateTime: vi.fn(),
    setSttTransferAddress: vi.fn(),
    setSttWalletInputs: vi.fn(),
    sttProofOfLifeOverrideMode: "specific",
    sttProofOfLifeSpecificDateTime: "",
    sttTransferAddress: "",
    sttTransferAmounts: {},
    sttWalletInputs: holder.sttWalletInputs
  })
}));

const { SttSpendEditorsView } = await import(
  "@/components/user/workspace/config-sttspend-editors-view"
);
const { STT_SPEND_ACTION_TABS } = await import(
  "@/components/user/workspace/stt-spend-action-tabs"
);

// The shipped entry, not a fixture. An earlier draft of these tests hardcoded the new strings
// into `holder.tab` and so passed against the reverted source, proving nothing.
const CONSOLIDATE_TAB = STT_SPEND_ACTION_TABS.find((tab) => tab.value === "consolidate-utxo")!;

type Utxo = {
  input: { txHash: string; outputIndex: number };
  output: { amount: Array<{ unit: string; quantity: string }> };
};

function renderView({
  selectedAction = "use",
  showProofOfLifeOverride = true,
  showLockedContractUtxoBrowser = false,
  increment = 30 * 24 * 60 * 60 * 1000 as number | null | undefined,
  unlockTime = 1_767_225_600_000 as number | null | undefined,
  walletInputs = [] as Array<{ txHash: string; outputIndex: number }>,
  address = "addr_test1wallet" as string | null,
  utxos = [] as Utxo[],
  utxosLoading = false,
  utxosError = null as string | null,
  tab = null as Record<string, unknown> | null
} = {}) {
  holder.selectedAction = selectedAction;
  holder.tab = tab ?? {
    showProofOfLifeOverride,
    showLockedContractUtxoBrowser,
    showQuickTransferBuilder: false,
    showTransfers: false,
    lockedInputsEditorLabel: "Fund pools",
    lockedInputsEditorHelper: "helper"
  };
  holder.lockingContract = {
    address,
    error: address ? null : "Choose a smart wallet first. Its address comes from the wallet you pick."
  };
  holder.increment = increment;
  holder.unlockTime = unlockTime;
  holder.sttWalletInputs = walletInputs;

  const store = createStore();
  store.set(lockedContractUtxosAtom, utxos as never);
  store.set(lockedContractUtxosLoadingAtom, utxosLoading);
  store.set(lockedContractUtxosErrorAtom, utxosError);
  return render(
    <Provider store={store}>
      <SttSpendEditorsView />
    </Provider>
  );
}

function renderTidyFunds(overrides: Parameters<typeof renderView>[0] = {}) {
  return renderView({
    selectedAction: "consolidate-utxo",
    tab: { ...CONSOLIDATE_TAB, showQuickTransferBuilder: false },
    ...overrides
  });
}

/**
 * The fund-pool selector and the proof-of-life override share one "Advanced settings"
 * disclosure: both hold overrides the app computes for you, so they read as one
 * it-can-wait panel with a labelled group each.
 */
describe("advanced settings disclosure", () => {
  it("names itself the way the app's other advanced disclosures do", () => {
    renderView();

    expect(screen.getByText("Advanced settings")).toBeInTheDocument();
    expect(screen.queryByText("Advanced fund options")).not.toBeInTheDocument();
    // The proof-of-life disclosure no longer exists as its own collapsible.
    expect(screen.queryByRole("button", { name: /Proof of life/ })).not.toBeInTheDocument();
  });

  it("says the app already picks the funds and the timer, and does not repeat itself inside", () => {
    renderView({ walletInputs: [{ txHash: "aa", outputIndex: 0 }] });

    expect(
      screen.getByText(
        "The app already picks the funds and renews the proof-of-life timer. Open this only to change either yourself."
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId("selector-helper")).toHaveTextContent(
      "Selected for you once you add a payout. Change the selection here if you want different funds."
    );
    expect(
      screen.queryByText("The app can suggest fund pools after you choose the recipient and amount.")
    ).not.toBeInTheDocument();
  });

  it("tells a scheduled payout where the money comes from when nothing is picked", () => {
    renderView({
      selectedAction: "payout-streaming-payment",
      showProofOfLifeOverride: false,
      walletInputs: [{ txHash: "aa", outputIndex: 0 }]
    });

    // Fund-selection wording on the closed description; the empty-is-valid fact stays as the
    // open-state helper. The two state different facts, as with the send's pair.
    expect(
      screen.getByText("Select the shared wallet's funds you want to pay from.")
    ).toBeInTheDocument();
    expect(screen.getByTestId("selector-helper")).toHaveTextContent(
      "Optional. Leave it empty and the payment comes from your own connected wallet."
    );
  });

  it("gives the allowance and beneficiary sends a funds-only description", () => {
    renderView({
      selectedAction: "use-allowance",
      showProofOfLifeOverride: false,
      walletInputs: [{ txHash: "aa", outputIndex: 0 }]
    });

    expect(
      screen.getByText(
        "The app already picks which funds to spend. Open this only to choose them yourself."
      )
    ).toBeInTheDocument();
    // A proof-of-life sentence named controls this tab never renders.
    expect(screen.queryByText(/Auto suits most/)).not.toBeInTheDocument();
  });

  it("never renders the pool browser beside the guided selector", () => {
    // `use` and the other guided tabs ship showLockedContractUtxoBrowser: true; both controls
    // edit the same `sttWalletInputs`, so the browser must stay hidden behind the gate. A
    // staged payout opens the disclosure, putting the selector in the DOM. Without a failed
    // read the selector renders no "Refresh funds" of its own either.
    renderView({
      walletInputs: [{ txHash: "aa", outputIndex: 0 }],
      tab: {
        showProofOfLifeOverride: true,
        showLockedContractUtxoBrowser: true,
        showQuickTransferBuilder: false,
        showTransfers: false,
        lockedInputsEditorLabel: "Fund pools",
        lockedInputsEditorHelper: "helper"
      }
    });

    expect(screen.getByTestId("selector-helper")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use this pool" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refresh funds/ })).not.toBeInTheDocument();
  });

  it("keeps an error and a retry when the guided funds read fails", () => {
    // The gate hides the pool browser's error line and "Refresh funds" for guided tabs;
    // the selector carries the equivalent pair, or the failure reads as an empty wallet
    // with no way back short of reloading.
    renderView({
      walletInputs: [{ txHash: "aa", outputIndex: 0 }],
      utxosError: "Could not reach the chain.",
      tab: {
        showProofOfLifeOverride: true,
        showLockedContractUtxoBrowser: true,
        showQuickTransferBuilder: false,
        showTransfers: false,
        lockedInputsEditorLabel: "Fund pools",
        lockedInputsEditorHelper: "helper"
      }
    });

    expect(screen.getByTestId("selector-error")).toHaveTextContent("Could not reach the chain.");
    holder.refreshLockedContractUtxos.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Refresh funds/ }));
    expect(holder.refreshLockedContractUtxos).toHaveBeenCalledWith("addr_test1wallet");
  });
});

function openAdvancedSettings() {
  fireEvent.click(screen.getByRole("button", { name: /Advanced settings/ }));
}

describe("proof of life", () => {
  it("describes the three choices it actually offers", () => {
    renderView();
    openAdvancedSettings();

    // "keep the proof of life unchanged" was not one of them, and the renew variant named a
    // tab called "Renew Proof of life" that does not exist (it is "Refresh proof of life").
    expect(
      screen.getByText(
        "Auto suits most sends. Open this only to clear the timer or set an exact date and time."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Auto (recommended)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Clear the proof of life" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Choose a date and time" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Auto: use the allowed renewal window" })
    ).not.toBeInTheDocument();
  });

  it("labels the control by what it does, not by the heading above it", () => {
    renderView();
    openAdvancedSettings();

    expect(screen.getByLabelText("What happens to the timer")).toBeInTheDocument();
    expect(screen.queryByText("Proof of life Update")).not.toBeInTheDocument();
  });

  it("shows the timer extension as a duration, not as raw milliseconds", () => {
    renderView();
    openAdvancedSettings();

    expect(screen.getByText(/Each check-in extends it by 30 days\./)).toBeInTheDocument();
    expect(screen.queryByText(/2592000000/)).not.toBeInTheDocument();
  });

  it("leads with the deadline and drops the line that only restated the form", () => {
    renderView();
    openAdvancedSettings();

    const paragraphs = screen
      .getByRole("region")
      .querySelectorAll("p.text-muted-foreground");
    expect(paragraphs[paragraphs.length - 2]?.textContent).toMatch(/^Recovery can start after /);
    expect(screen.queryByText(/Applied when preparing/)).not.toBeInTheDocument();
  });

  it("says what the chosen date means instead of how it is stored", () => {
    renderView();
    openAdvancedSettings();

    expect(screen.getByTestId("date-helper")).toHaveTextContent(
      "Recovery cannot start before this moment."
    );
  });

  it("draws no second bordered box inside the disclosure panel", () => {
    renderView();
    openAdvancedSettings();

    // `DisclosureSection` is already a rounded-lg bordered panel with px-4 of its own.
    const region = screen.getByRole("region");
    expect(region.querySelectorAll("div.rounded-lg.border")).toHaveLength(0);
  });
});

/**
 * The fund-pool browser reaches only `consolidate-utxo`: every other action either uses the
 * guided selector or has `showLockedContractUtxoBrowser: false`. So this block is the Tidy
 * funds screen.
 */
describe("tidy funds: choosing pools", () => {
  it("asks for one pool, which is what the validator and the builder ask for", () => {
    renderTidyFunds();

    // `action-validation.ts:238-243` passes a minimum of 1, and
    // `lib/mesh/transactions/consolidate-utxos.ts:19` rejects only `length < 1`. The form used
    // to say "at least two" three lines above an error that said "at least one".
    expect(
      screen.getByText(
        "Choose the fund pools to merge. Picking just one is allowed: that moves it back to the wallet's main address."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/at least two fund pools/)).not.toBeInTheDocument();
  });

  it("gives its two pool controls different names", () => {
    renderTidyFunds();

    expect(screen.getByText("Choose fund pools")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Paste a transaction hash and output index for a pool the list above does not show."
      )
    ).toBeInTheDocument();
    // Both controls used to be labelled "Fund pools" on the same screen.
    expect(screen.queryByText("Fund pools")).not.toBeInTheDocument();
  });

  /**
   * Every tab here names "fund pools", but only the wallet-home assets panel said what a
   * pool is. The label now carries the same shared definition (`mental-model-copy.ts`), so
   * the reader picking pools is one click from the term's meaning, on every tab that asks
   * for one.
   */
  it("keeps the shared fund-pool definition one click from the pool list", () => {
    renderTidyFunds();

    fireEvent.click(screen.getByRole("button", { name: "What fund pools are" }));
    expect(screen.getByText(/separate chunks called UTxOs/)).toBeInTheDocument();
  });

  it("drops the unlabelled wallet address and keeps the reason the list is empty", () => {
    renderTidyFunds({ address: null });

    expect(
      screen.getByText("Choose a smart wallet first. Its address comes from the wallet you pick.")
    ).toBeInTheDocument();

    const { container } = renderTidyFunds({ address: "addr_test1tidy" });
    expect(container.textContent).not.toContain("addr_test1tidy");
  });

  it("names the row button for what it does, not for the other button on the page", () => {
    renderTidyFunds({
      utxos: [
        {
          input: { txHash: "aa11", outputIndex: 0 },
          output: { amount: [{ unit: "lovelace", quantity: "5000000" }] }
        }
      ]
    });

    expect(screen.getByRole("button", { name: "Use this pool" })).toBeInTheDocument();
    // `editors/asset-editors.tsx:321` already owns "Add fund pool", and it adds a blank row.
    expect(screen.queryByRole("button", { name: "Add fund pool" })).not.toBeInTheDocument();
  });

  it("does not report a failed read as an empty wallet", () => {
    renderTidyFunds({ utxosError: "Could not reach the chain." });

    expect(screen.getByText("Could not reach the chain.")).toBeInTheDocument();
    expect(
      screen.queryByText("No spendable wallet funds found right now.")
    ).not.toBeInTheDocument();
  });

  it("still says the wallet is empty when the read succeeded and found nothing", () => {
    renderTidyFunds();

    expect(
      screen.getByText("No spendable wallet funds found right now.")
    ).toBeInTheDocument();
  });

  it("steps the pool list down a radius rung from the panel around it", () => {
    const { container } = renderTidyFunds({
      utxos: [
        {
          input: { txHash: "aa11", outputIndex: 0 },
          output: { amount: [{ unit: "lovelace", quantity: "5000000" }] }
        }
      ]
    });

    // Panel rounded-lg > list rounded-md > row rounded-md. Before, all three were rounded-lg.
    expect(container.querySelectorAll("div.rounded-lg.border")).toHaveLength(1);
    expect(container.querySelectorAll("div.rounded-md.border").length).toBeGreaterThan(1);
  });
});
