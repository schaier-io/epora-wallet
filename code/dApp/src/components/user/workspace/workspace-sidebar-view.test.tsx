import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({
    dispatchWorkspaceAction: vi.fn(),
    handleConsolidateOrphans: vi.fn(),
    guidedEverydayActions: [],
    guidedAdminGroups: [],
    guidedToolActions: [],
    hasGuidedActivityContext: false,
    isGuidedHomeSelected: false,
    isGuidedTransactionsSelected: false,
    openGuidedOverview: vi.fn()
  })
}));

const { WorkspaceSidebarView } = await import(
  "@/components/user/workspace/workspace-sidebar-view"
);

/**
 * With no smart wallet resolved, the sidebar used to say "setup" three times: a panel reading
 * "Setup is open / Choose the setup details first.", a second panel reading "Create wallet /
 * Setup is selected for this workspace.", and an empty scroller between them. VERIFIED in the
 * browser by opening `/user?wallet=<a unit that does not exist>`: the header above it said
 * "Open a wallet", so the sidebar was describing a mode the reader was not in.
 *
 * The state is "no wallet open", and its one useful control is the button that goes back to
 * the wallet chooser. That button said "Home", which is also what the entry above it is
 * called when a wallet IS open, for a different destination.
 */
describe("workspace sidebar, no wallet open", () => {
  it("names the state instead of calling it setup", () => {
    render(<WorkspaceSidebarView />);

    expect(screen.getByText("No wallet open")).toBeTruthy();
    expect(screen.queryByText("Setup is open")).toBeNull();
    expect(screen.queryByText(/Setup is selected/)).toBeNull();
  });

  it("names the button after where it goes", () => {
    render(<WorkspaceSidebarView />);

    expect(screen.getByRole("button", { name: "Choose a wallet" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
  });

  it("does not render an empty scroller", () => {
    const { container } = render(<WorkspaceSidebarView />);

    expect(container.querySelector(".user-scrollbar")).toBeNull();
  });
});
