import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { detectedSttTokensErrorAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    actionConfigurationRef: { current: null },
    activeActionDefinition: { label: "Send" },
    clearActionDraft: vi.fn(),
    resetActionDraft: vi.fn(),
    selectedActionRouteExplanation: "",
    sendRouteExplanation: "",
    hasActiveComposer: false,
    setupCheckpoint: "ready",
    createInlineSharedReference: vi.fn()
  })
}));

const { WorkspaceMainPanelView } = await import(
  "@/components/user/workspace/workspace-main-panel-view"
);

/**
 * A link can name a wallet that the detected list does not hold: the list is still loading,
 * the wallet is someone else's, or detection failed outright (a burst of `/api/mesh` calls
 * tripping the rate limit did exactly that). The panel used to answer with a "Choose an
 * action" card that pointed at an action rail no longer on screen, and said nothing about
 * the failed load.
 */
function renderWithWalletInUrl(detectionError: string | null) {
  const store = createStore();
  store.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("wallet=unit&step=overview")));
  store.set(detectedSttTokensErrorAtom, detectionError);
  return render(
    <Provider store={store}>
      <WorkspaceMainPanelView />
    </Provider>
  );
}

describe("main panel with a wallet in the link that is not in the detected list", () => {
  it("renders no card at all while there is nothing to show", () => {
    const { container } = renderWithWalletInUrl(null);

    expect(screen.queryByText("Choose an action")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("says the wallet could not load when detection failed", () => {
    renderWithWalletInUrl("Too many requests. Wait a moment, then try again.");

    expect(screen.getByText("Could not load this wallet. Reload the page to try again.")).toBeInTheDocument();
    expect(screen.getByText("Too many requests. Wait a moment, then try again.")).toBeInTheDocument();
  });
});
