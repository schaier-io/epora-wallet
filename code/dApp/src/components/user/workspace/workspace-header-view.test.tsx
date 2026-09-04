import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWallet } from "@meshsdk/core";
import { activeWalletAtom, networkIdAtom } from "@/providers/wallet.atoms";
import {
  detectedSttTokensErrorAtom,
  detectedSttTokensLoadingAtom,
  walletBalanceSummaryAtom
} from "@/components/user/workspace/atoms/workspace-data.atoms";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";

const actions = vi.hoisted(() => ({
  refreshDetectedTokens: vi.fn(),
  refreshPermissionWalletSummaries: vi.fn(),
  refreshWorkspaceSummary: vi.fn()
}));

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    permissionWalletCards: [{ unit: "a" }, { unit: "b" }],
    ...actions,
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
function renderWith(
  summary: { assets: unknown[]; loading: boolean; error: string | null },
  smartWalletsLoading = false,
  smartWalletsError: string | null = null
) {
  const store = createStore();
  store.set(activeWalletAtom, {} as BrowserWallet);
  store.set(networkIdAtom, 0);
  store.set(walletBalanceSummaryAtom, summary as never);
  store.set(detectedSttTokensLoadingAtom, smartWalletsLoading);
  store.set(detectedSttTokensErrorAtom, smartWalletsError);
  store.set(
    routeStateAtom,
    parseWorkspaceRouteState(new URLSearchParams("wallet=requested-wallet"))
  );
  return render(
    <Provider store={store}>
      <WorkspaceHeaderView />
    </Provider>
  );
}

describe("workspace header", () => {
  beforeEach(() => {
    actions.refreshDetectedTokens.mockReset();
    actions.refreshPermissionWalletSummaries.mockReset();
    actions.refreshWorkspaceSummary.mockReset();
  });

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

  it("shows a loading shell instead of a false empty-wallet message", () => {
    renderWith({ assets: [], loading: false, error: null }, true);

    expect(screen.getByRole("status", { name: "Loading your wallet…" })).toBeTruthy();
    expect(screen.queryByText("Open a wallet")).toBeNull();
  });

  it("shows a lookup failure instead of claiming that no wallet is open", () => {
    renderWith(
      { assets: [], loading: false, error: null },
      false,
      "Could not check the chain for smart wallets."
    );

    expect(screen.getByText("Wallet could not load")).toBeTruthy();
    expect(screen.queryByText("Open a wallet")).toBeNull();
  });

  it("names the smart-wallet button with the label the reader can see", () => {
    renderWith({ assets: [], loading: false, error: null });

    const button = screen.getByRole("button", { name: /^Smart wallets, 2\./ });
    expect(button.textContent).toContain("Smart wallets");
  });

  it("does not refresh summaries from an invalidated smart-wallet scan", async () => {
    actions.refreshDetectedTokens.mockResolvedValue(null);
    renderWith({ assets: [], loading: false, error: null });

    fireEvent.click(screen.getByRole("button", { name: /^Smart wallets, 2\./ }));

    await waitFor(() => expect(actions.refreshDetectedTokens).toHaveBeenCalledOnce());
    expect(actions.refreshPermissionWalletSummaries).not.toHaveBeenCalled();
  });
});
