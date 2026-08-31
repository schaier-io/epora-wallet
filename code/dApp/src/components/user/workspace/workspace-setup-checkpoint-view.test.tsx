import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { lockedContractUtxosLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import type { SetupCheckpoint } from "@/components/user/flow-types";

const setupCheckpoint = vi.hoisted(() => ({ value: "funding" as SetupCheckpoint }));

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    createInlineSharedReference: vi.fn(),
    setupCheckpoint: setupCheckpoint.value
  })
}));

const { SetupCheckpointCardView } = await import(
  "@/components/user/workspace/workspace-setup-checkpoint-view"
);

/**
 * The `funding` checkpoint fires on `lockedUtxosLoading || lockedUtxoCount === 0`
 * (`workspace-controller.ts:385-389`), which is two different situations. One message covered
 * both: "Load fund pools / This action needs wallet funds first. Refresh the selected wallet or
 * choose a different action." It told a reader whose wallet held nothing to refresh, and told a
 * reader who was only waiting that something was wrong. Neither could act on it.
 */
function renderWith(loading: boolean) {
  const store = createStore();
  store.set(lockedContractUtxosLoadingAtom, loading);
  return render(
    <Provider store={store}>
      <SetupCheckpointCardView />
    </Provider>
  );
}

describe("setup checkpoint, funding", () => {
  it("says it is still reading while the fund pools load", () => {
    renderWith(true);

    expect(screen.getByText(/Checking this wallet's funds/)).toBeTruthy();
    expect(screen.queryByText(/has no funds yet/)).toBeNull();
  });

  it("says the wallet is empty, and names the action that fixes it", () => {
    renderWith(false);

    expect(screen.getByText("This wallet has no funds yet")).toBeTruthy();
    expect(screen.getByText(/Choose Receive funds to add some/)).toBeTruthy();
    expect(screen.queryByText(/Checking this wallet's funds/)).toBeNull();
  });
});
