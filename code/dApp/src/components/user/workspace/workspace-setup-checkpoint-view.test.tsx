import "@/test/mock-workspace-queries";
import { lockedContractUtxosLoadingAtom, sharedSttReferenceStoreLoadingAtom } from "@/test/workspace-query-fixtures";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

import type { SetupCheckpoint } from "@/components/user/flow-types";

const refreshHelper = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const setupCheckpoint = vi.hoisted(() => ({ value: "funding" as SetupCheckpoint }));

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    createInlineSharedReference: vi.fn(),
    refreshSharedSttReferenceStore: refreshHelper,
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
  store.set(sharedSttReferenceStoreLoadingAtom, loading);
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

it("links to setup and keeps the read-only retry when the shared helper is unavailable", () => {
  setupCheckpoint.value = "shared-reference";
  renderWith(false);
  expect(screen.queryByText(/helper/i)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Set up STT reference" })).toHaveAttribute("href", "/setup");
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  expect(refreshHelper).toHaveBeenCalledTimes(1);
});

it("shows checking rather than unavailable while discovery runs", () => {
  setupCheckpoint.value = "shared-reference";
  renderWith(true);
  expect(screen.getByText("Checking service availability")).toBeInTheDocument();
  expect(screen.queryByText("Service temporarily unavailable")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
});
