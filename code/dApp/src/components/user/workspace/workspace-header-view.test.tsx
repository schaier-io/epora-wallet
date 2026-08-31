import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import type { BrowserWallet } from "@meshsdk/core";
import { activeWalletAtom, networkIdAtom } from "@/providers/wallet.atoms";
import { walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    permissionWalletCards: [{ unit: "a" }, { unit: "b" }],
    refreshDetectedTokens: vi.fn(),
    refreshPermissionWalletSummaries: vi.fn(),
    refreshWorkspaceSummary: vi.fn(),
    selectedActionDefinition: { label: "Send funds" }
  })
}));

const { WorkspaceHeaderView } = await import(
  "@/components/user/workspace/workspace-header-view"
);

/**
 * The funds pill said "Checking funds…" forever once a connected wallet turned out to be
 * empty: the pending flag was OR-ed with "the balance is zero", and a wallet that has
 * finished loading and holds nothing satisfies that clause on every render. VERIFIED in the
 * browser with the demo wallet, whose `getUtxos` resolves to `[]`: still checking, spinner
 * turning, 15 minutes after load.
 */
function renderWith(summary: { assets: unknown[]; loading: boolean; error: string | null }) {
  const store = createStore();
  store.set(activeWalletAtom, {} as BrowserWallet);
  store.set(networkIdAtom, 0);
  store.set(walletBalanceSummaryAtom, summary as never);
  return render(
    <Provider store={store}>
      <WorkspaceHeaderView />
    </Provider>
  );
}

describe("workspace header", () => {
  it("says the wallet is empty instead of checking forever", () => {
    renderWith({ assets: [], loading: false, error: null });

    const label = screen.getByText("No ADA available");
    expect(screen.queryByText("Checking funds…")).toBeNull();
    // Nothing to add to "No ADA available", so the pill carries no tooltip.
    expect(label.closest("span[title]")).toBeNull();
  });

  it("still says it is checking while the balance is loading", () => {
    renderWith({ assets: [], loading: true, error: null });

    expect(screen.getByText("Checking funds…")).toBeTruthy();
  });

  it("names the smart-wallet button with the label the reader can see", () => {
    renderWith({ assets: [], loading: false, error: null });

    const button = screen.getByRole("button", { name: /^Smart wallets, 2\./ });
    expect(button.textContent).toContain("Smart wallets");
  });
});
