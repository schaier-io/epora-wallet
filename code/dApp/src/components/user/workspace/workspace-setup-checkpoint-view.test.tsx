import { act, fireEvent, render, screen } from "@testing-library/react";
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

  /**
   * This card is the only thing that says why the panel beneath it cannot be used, and it
   * rewrites itself with no input from the reader. `role="status"` carries that, but a polite
   * region only announces reliably when the node survives the update: every branch returns one
   * `div` in the same position, so React reconciles them onto one host node and the text
   * changes in place. Pinning the identity keeps a future branch from returning a different
   * wrapper and silently turning the announcement back off.
   */
  it("updates one live region in place when the funds finish loading", () => {
    setupCheckpoint.value = "funding";
    const store = createStore();
    store.set(lockedContractUtxosLoadingAtom, true);
    const { container } = render(
      <Provider store={store}>
        <SetupCheckpointCardView />
      </Provider>
    );

    const region = container.querySelector('[role="status"]');
    expect(region?.textContent).toContain("Checking this wallet's funds");

    act(() => {
      store.set(lockedContractUtxosLoadingAtom, false);
    });

    expect(container.querySelector('[role="status"]')).toBe(region);
    expect(region?.textContent).toContain("This wallet has no funds yet");
  });
});

describe("setup checkpoint, shared reference", () => {
  /**
   * A reader can reach this card without ever opening the mint screen, where the
   * "setup helper" term is defined. The card now carries the same shared definition
   * (`mental-model-copy.ts`) behind an info hint, instead of naming the helper twice
   * with no explanation of what one is.
   */
  it("explains the setup helper term next to the ask", () => {
    setupCheckpoint.value = "shared-reference";
    renderWith(false);

    expect(screen.getByText("One-time setup needed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More about setup helper" }));
    expect(screen.getByText(/one-time deposit/)).toBeTruthy();
  });
});
