import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { BrowserWallet } from "@meshsdk/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activeWalletAtom, networkIdAtom } from "@/providers/wallet.atoms";
import {
  detectedSttTokensLoadingAtom,
  permissionWalletSummariesLoadingAtom
} from "@/components/user/workspace/atoms/workspace-data.atoms";

// Only the fields the view reads. `token.unit` is the key and the selection id.
const cards: Array<{
  token: { unit: string };
  primaryLabel: string;
  secondaryLabel: string;
  roleBadges: string[];
  lockedSummary: undefined;
  warning: null;
}> = [];

const actions = vi.hoisted(() => ({
  refreshDetectedTokens: vi.fn(),
  refreshPermissionWalletSummaries: vi.fn()
}));

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    autoOpenDetectedWalletUnit: null,
    filteredPermissionWalletCards: cards,
    handleDetectedTokenChange: vi.fn(),
    handleFlowBranchSelect: vi.fn(),
    permissionWalletCards: cards,
    refreshDetectedTokens: actions.refreshDetectedTokens,
    refreshPermissionWalletSummaries: actions.refreshPermissionWalletSummaries
  })
}));

const { WalletSelectionDialogView } = await import(
  "@/components/user/workspace/workspace-wallet-selection-dialog-view"
);

/**
 * `walletReadyAtom` is `activeWallet && networkId === 0`, so one falsy value stands for two
 * very different problems: nobody has connected yet, and someone has connected on the wrong
 * network. The list is empty either way, and the instruction that clears it is not.
 *
 * The second case cannot be produced in the browser with the demo wallet, which reports
 * Preprod, so it is held here. It is also the case the old copy got wrong twice over: it
 * said "Finish step 1 first", and the numbered step it pointed at is drawn only while no
 * wallet is connected, which is precisely when this case cannot happen.
 */
function renderWith(network: number | null, connected: boolean) {
  const store = createStore();
  if (connected) {
    // Only its truthiness is read, through `walletReadyAtom`.
    store.set(activeWalletAtom, {} as BrowserWallet);
  }
  store.set(networkIdAtom, network);
  store.set(detectedSttTokensLoadingAtom, false);
  store.set(permissionWalletSummariesLoadingAtom, false);

  return render(
    <Provider store={store}>
      <WalletSelectionDialogView />
    </Provider>
  );
}

describe("wallet selection dialog", () => {
  beforeEach(() => {
    cards.length = 0;
    actions.refreshDetectedTokens.mockReset();
    actions.refreshPermissionWalletSummaries.mockReset();
  });

  it("asks for a connection when there is no wallet", () => {
    renderWith(null, false);

    expect(screen.getByText("No wallet connected")).toBeTruthy();
  });

  it("names the network when a connected wallet is on the wrong one", () => {
    const { container } = renderWith(1, true);

    expect(screen.getByText("Your wallet is on the wrong network")).toBeTruthy();
    expect(container.textContent).toMatch(/Preprod/);
  });

  it("does not send anyone to a step that is only drawn while disconnected", () => {
    const { container } = renderWith(1, true);

    expect(container.textContent).not.toMatch(/step 1/i);
  });

  it("names each wallet card, explains its badges, and drops the transaction subtitle", () => {
    cards.push({
      token: { unit: "unit-1" },
      primaryLabel: "Family",
      secondaryLabel: "f8482092d1",
      roleBadges: ["Owner", "Receive only"],
      lockedSummary: undefined,
      warning: null
    });
    const { container } = renderWith(0, true);

    // The card keeps its rendered content as its accessible name, so the badges and
    // their explanations are announced along with the wallet name.
    expect(
      screen.getByRole("button", {
        name: /Family.*Owner\. You are an owner of this wallet\..*Receive only\. This wallet can only receive funds\./
      })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create new smart wallet" })).toBeTruthy();
    expect(screen.getByTitle("You are an owner of this wallet.")).toBeTruthy();
    expect(screen.getByTitle("This wallet can only receive funds.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Created in transaction|f8482092d1/);
    // Not the current wallet, so no status badge at all.
    expect(container.textContent).not.toMatch(/Current|Opened/);
    expect(screen.getByPlaceholderText("Search by wallet name")).toBeTruthy();
  });

  it("refreshes summaries from the completed token scan", async () => {
    const tokens = [{ unit: "new-wallet" }];
    let resolveDetected!: (value: { tokens: typeof tokens }) => void;
    actions.refreshDetectedTokens.mockReturnValue(
      new Promise((resolve) => {
        resolveDetected = resolve;
      })
    );
    renderWith(0, true);

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(actions.refreshPermissionWalletSummaries).not.toHaveBeenCalled();

    resolveDetected({ tokens });
    await waitFor(() =>
      expect(actions.refreshPermissionWalletSummaries).toHaveBeenCalledWith(tokens)
    );
  });
});
