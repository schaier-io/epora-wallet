import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { BrowserWallet } from "@meshsdk/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activeWalletAtom, networkIdAtom } from "@/providers/wallet.atoms";

// Only the fields the view reads. `token.unit` is the key and the selection id.
const cards: Array<{
  token: { unit: string };
  primaryLabel: string;
  secondaryLabel: string;
  roleBadges: string[];
  lockedSummary: undefined;
  warning: null;
}> = [];

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    autoOpenDetectedWalletUnit: null,
    filteredPermissionWalletCards: cards,
    handleDetectedTokenChange: vi.fn(),
    handleFlowBranchSelect: vi.fn(),
    permissionWalletCards: cards,
    refreshDetectedTokens: vi.fn(),
    refreshPermissionWalletSummaries: vi.fn()
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

  return render(
    <Provider store={store}>
      <WalletSelectionDialogView />
    </Provider>
  );
}

describe("wallet selection dialog", () => {
  beforeEach(() => {
    cards.length = 0;
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
});
