import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { sharedSttReferenceStoreLoadingAtom, sharedSttReferenceStoreErrorAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";

import { activeWalletAtom, networkIdAtom } from "@/providers/wallet.atoms";
const createHelper = vi.hoisted(() => vi.fn());
const refreshHelper = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const showSharedReferenceSetup = vi.hoisted(() => ({ value: true }));

// The editors are separately owned surfaces (E11, E12, E13); this asks about the mint view's
// own chrome, so they stand in as markers.
vi.mock("@/components/user/workspace/editors", () => ({
  AssetListEditor: ({ helper }: { helper: string }) => <div data-testid="assets">{helper}</div>,
  InlineFieldError: () => null,
  SetupProgressStepper: () => <div data-testid="stepper" />,
  StateFormEditor: ({ helper }: { helper: string }) => <div data-testid="rules">{helper}</div>,
  WalletNameEditor: () => <div data-testid="wallet-name" />
}));

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    activeFieldErrors: {},
    createInlineSharedReference: createHelper,
    refreshSharedSttReferenceStore: refreshHelper,
    mintSetupSteps: [],
    showSharedReferenceSetup: showSharedReferenceSetup.value
  })
}));

vi.mock("@/components/user/workspace/forms/use-mint-form", () => ({
  useMintForm: () => ({
    mintStarterAssets: [{ unit: "lovelace", quantity: "5000000" }],
    mintStateForm: { walletName: "Family wallet" },
    mintZeroAdminConfirmed: false,
    setMintStarterAssets: vi.fn(),
    setMintStateForm: vi.fn(),
    setMintZeroAdminConfirmed: vi.fn()
  })
}));

const { MintConfigView } = await import("@/components/user/workspace/config-mint-view");

function renderView({ helperLoading = false, lookupError = "" } = {}) {
  const store = createStore();
  store.set(sharedSttReferenceStoreLoadingAtom, helperLoading);
  if (lookupError) {
    store.set(sharedSttReferenceStoreErrorAtom, lookupError);
    store.set(activeWalletAtom, {} as never);
    store.set(networkIdAtom, 0);
  }
  return render(
    <Provider store={store}>
      <MintConfigView />
    </Provider>
  );
}

/**
 * `UserActionConfigurationCard` renders a title and a description for every action, and this
 * view opened with its own heading panel saying the same thing: "Create new wallet / Choose
 * people, rules, and starter funds." immediately above "Create your Cardano wallet / One
 * shared wallet on Cardano …". Two heading/description pairs, stacked, for one screen.
 */
describe("mint configuration view", () => {
  it("does not repeat the card's own heading", () => {
    renderView();

    expect(screen.queryByText("Create your Cardano wallet")).not.toBeInTheDocument();
    expect(screen.queryByText(/One shared wallet on Cardano/)).not.toBeInTheDocument();
  });

  it("opens on the setup steps, which is the part the card does not say", () => {
    const { container } = renderView();

    expect(screen.getByTestId("stepper")).toBeInTheDocument();
    expect(container.firstElementChild?.firstElementChild).toBe(screen.getByTestId("stepper"));
  });

  it("carries no em dash", () => {
    const { container } = renderView();

    expect(container.textContent).not.toMatch(/[—–]/);
  });

  /**
   * The starter-balance panel sat alone inside `md:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]`.
   * A two-column grid with one child renders that child at 65% width and leaves the rest of
   * the row permanently empty.
   */
  it("gives the starter-balance panel the whole row", () => {
    const { container } = renderView();

    expect(container.querySelectorAll('[class*="grid-cols-"]')).toHaveLength(0);
  });

  it.each([false, true])("keeps helper infrastructure out of mint setup while loading=%s", (helperLoading) => {
    renderView({ helperLoading, lookupError: "Internal helper lookup failed" });
    expect(screen.queryByText(/helper/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
  });

  it("describes the starter assets without naming the widget", () => {
    renderView();

    const helper = screen.getByTestId("assets").textContent ?? "";
    expect(helper).not.toContain("token rows");
    expect(helper).toContain("any tokens you want in the wallet from the start");
  });
});
