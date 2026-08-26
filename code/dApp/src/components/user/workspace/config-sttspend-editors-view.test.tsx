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
  sttWalletInputs: [] as Array<{ txHash: string; outputIndex: number }>
}));

// The selector, the manual ref editor, and the date field are surfaces of their own (E11,
// E12). Stubbing them keeps this test on the strings and the chrome this file owns, while
// still exposing the `helper` prop it passes down.
vi.mock("@/components/user/workspace/editors", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  GuidedLockedUtxoSelector: ({ helper }: { helper: string }) => (
    <p data-testid="selector-helper">{helper}</p>
  ),
  GuidedDateTimeField: ({ helper }: { helper?: string }) => (
    <p data-testid="date-helper">{helper}</p>
  ),
  WalletInputRefsEditor: () => null,
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
    refreshLockedContractUtxos: vi.fn(),
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

function renderView({
  selectedAction = "use",
  showProofOfLifeOverride = true,
  increment = 30 * 24 * 60 * 60 * 1000 as number | null | undefined,
  unlockTime = 1_767_225_600_000 as number | null | undefined,
  walletInputs = [] as Array<{ txHash: string; outputIndex: number }>
} = {}) {
  holder.selectedAction = selectedAction;
  holder.tab = {
    showProofOfLifeOverride,
    showLockedContractUtxoBrowser: false,
    showQuickTransferBuilder: false,
    showTransfers: false,
    lockedInputsEditorLabel: "Fund pools",
    lockedInputsEditorHelper: "helper"
  };
  holder.lockingContract = { address: "addr_test1wallet", error: null };
  holder.increment = increment;
  holder.unlockTime = unlockTime;
  holder.sttWalletInputs = walletInputs;

  const store = createStore();
  store.set(lockedContractUtxosAtom, []);
  store.set(lockedContractUtxosLoadingAtom, false);
  store.set(lockedContractUtxosErrorAtom, null);
  return render(
    <Provider store={store}>
      <SttSpendEditorsView />
    </Provider>
  );
}

/**
 * The disclosure's description is read with the section closed, its helper with the section
 * open. Both used to say the app can suggest fund pools once you set a recipient and amount,
 * so opening the section repeated the sentence that made you open it. Worse, "can suggest"
 * was not what happens: `use-workspace-send-action-effects.ts:36-49` selects the pools for
 * you the moment a payout is staged.
 */
describe("advanced fund options", () => {
  it("names itself the way the app's other advanced disclosures do", () => {
    renderView();

    expect(screen.getByText("Advanced fund options")).toBeInTheDocument();
    expect(screen.queryByText("Advanced: locked fund pools")).not.toBeInTheDocument();
  });

  it("says the app already picks the funds, and does not repeat itself inside", () => {
    renderView({ walletInputs: [{ txHash: "aa", outputIndex: 0 }] });

    expect(
      screen.getByText(
        "The app already picks which funds to spend. Open this only to choose them yourself."
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

    expect(
      screen.getByText(
        "Optional. Leave it empty and the payment comes from your own connected wallet."
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId("selector-helper")).toHaveTextContent(
      "Select the shared wallet's funds you want to pay from."
    );
  });
});

function openWakeUpTimer() {
  fireEvent.click(screen.getByRole("button", { name: /Wake-up timer/ }));
}

describe("wake-up timer", () => {
  it("describes the three choices it actually offers", () => {
    renderView();

    // "keep the wake-up timer unchanged" was not one of them, and the renew variant named a
    // tab called "Renew Wake-up timer" that does not exist (it is "Refresh wake-up timer").
    expect(
      screen.getByText(
        "Auto suits most sends. Open this only to clear the timer or set an exact date and time."
      )
    ).toBeInTheDocument();

    openWakeUpTimer();
    expect(screen.getByRole("option", { name: "Auto (recommended)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Clear the wake-up timer" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Choose a date and time" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Auto: use the allowed renewal window" })
    ).not.toBeInTheDocument();
  });

  it("labels the control by what it does, not by the heading above it", () => {
    renderView();
    openWakeUpTimer();

    expect(screen.getByLabelText("What happens to the timer")).toBeInTheDocument();
    expect(screen.queryByText("Wake-up timer Update")).not.toBeInTheDocument();
  });

  it("shows the timer extension as a duration, not as raw milliseconds", () => {
    renderView();
    openWakeUpTimer();

    expect(screen.getByText(/Each check-in extends it by 30 days\./)).toBeInTheDocument();
    expect(screen.queryByText(/2592000000/)).not.toBeInTheDocument();
  });

  it("leads with the deadline and drops the line that only restated the form", () => {
    renderView();
    openWakeUpTimer();

    const paragraphs = screen
      .getByRole("region")
      .querySelectorAll("p.text-muted-foreground");
    expect(paragraphs[paragraphs.length - 2]?.textContent).toMatch(/^Recovery can start after /);
    expect(screen.queryByText(/Applied when preparing/)).not.toBeInTheDocument();
  });

  it("says what the chosen date means instead of how it is stored", () => {
    renderView();
    openWakeUpTimer();

    expect(screen.getByTestId("date-helper")).toHaveTextContent(
      "Recovery cannot start before this moment."
    );
  });

  it("draws no second bordered box inside the disclosure panel", () => {
    renderView();
    openWakeUpTimer();

    // `DisclosureSection` is already a rounded-lg bordered panel with px-4 of its own.
    const region = screen.getByRole("region");
    expect(region.querySelectorAll("div.rounded-lg.border")).toHaveLength(0);
  });
});
