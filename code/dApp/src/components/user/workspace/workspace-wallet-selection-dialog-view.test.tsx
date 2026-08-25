import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { BrowserWallet } from "@meshsdk/core";
import { describe, expect, it, vi } from "vitest";
import { activeWalletAtom, networkIdAtom } from "@/providers/wallet.atoms";

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    autoOpenDetectedWalletUnit: null,
    filteredPermissionWalletCards: [],
    handleDetectedTokenChange: vi.fn(),
    handleFlowBranchSelect: vi.fn(),
    permissionWalletCards: [],
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
});
