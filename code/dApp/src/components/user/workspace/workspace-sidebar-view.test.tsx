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

/**
 * `Turn on staking` and `Claim rewards` shipped inside the collapsed "Advanced" panel next to
 * `Tidy funds`, `Governance` and `Cast a vote`. Earning and collecting rewards are ordinary
 * wallet tasks, so they belong with Send and Pay; the maintenance and governance tools keep
 * the fold.
 */
describe("workspace sidebar, wallet open", () => {
  it("lists staking and rewards with the common actions and keeps the rest advanced", async () => {
    vi.doMock("@/components/user/workspace/atoms/workspace-detected-token.atoms", async (importOriginal) => {
      const { atom } = await import("jotai");
      return {
        ...(await importOriginal<Record<string, unknown>>()),
        selectedDetectedTokenAtom: atom(() => ({ unit: "token" })),
        orphanDiscoveryAssetNameHexAtom: atom(() => ""),
        orphanDiscoveryPolicyIdAtom: atom(() => ""),
        orphanDiscoveryWalletAddressAtom: atom(() => "")
      };
    });
    vi.doMock("@/components/user/stake-address-discovery-panel", () => ({
      StakeAddressDiscoveryPanel: () => null
    }));
    vi.doMock("@/components/user/workspace/workspace-guided-action-section-view", () => ({
      GuidedActionSectionView: ({
        title,
        actions
      }: {
        title: string | null;
        actions: Array<{ title: string }>;
      }) => (
        <ul aria-label={title ?? "Advanced actions"}>
          {actions.map((entry) => (
            <li key={entry.title}>{entry.title}</li>
          ))}
        </ul>
      )
    }));
    vi.doMock("@/components/user/workspace/workspace-actions-context", () => ({
      useWorkspaceActions: () => ({
        dispatchWorkspaceAction: vi.fn(),
        handleConsolidateOrphans: vi.fn(),
        guidedEverydayActions: [{ intent: "send", action: "use", title: "Send" }],
        guidedAdminGroups: [],
        guidedToolActions: [
          { intent: "enable-staking", action: "set-intended-stake-credential", title: "Turn on staking" },
          { intent: "rewards", action: "wallet-withdraw", title: "Claim rewards" },
          { intent: "governance-vote", action: "wallet-vote", title: "Cast a vote" },
          { intent: "consolidate", action: "consolidate-utxo", title: "Tidy funds" }
        ],
        hasGuidedActivityContext: false,
        isGuidedHomeSelected: true,
        isGuidedTransactionsSelected: false,
        openGuidedOverview: vi.fn()
      })
    }));
    vi.resetModules();
    const { WorkspaceSidebarView: View } = await import(
      "@/components/user/workspace/workspace-sidebar-view"
    );

    const { within } = await import("@testing-library/react");
    render(<View />);

    const common = screen.getByRole("list", { name: "Common actions" });
    expect(within(common).getByText("Send")).toBeTruthy();
    expect(within(common).getByText("Turn on staking")).toBeTruthy();
    expect(within(common).getByText("Claim rewards")).toBeTruthy();

    const advanced = screen.getByRole("list", { name: "Advanced actions" });
    expect(within(advanced).getByText("Cast a vote")).toBeTruthy();
    expect(within(advanced).getByText("Tidy funds")).toBeTruthy();
    expect(within(advanced).queryByText("Claim rewards")).toBeNull();
  });
});

/** A wallet that failed to load is not "not one of yours". The sidebar says which it was. */
describe("workspace sidebar, wallet failed to load", () => {
  it("says the wallet could not load instead of disowning it", async () => {
    // The previous block left a wallet open through `doMock`; this state has none.
    vi.doMock("@/components/user/workspace/atoms/workspace-detected-token.atoms", async (importOriginal) => {
      const { atom } = await import("jotai");
      return {
        ...(await importOriginal<Record<string, unknown>>()),
        selectedDetectedTokenAtom: atom(() => null)
      };
    });
    vi.doMock("@/components/user/workspace/atoms/workspace-data.atoms", async (importOriginal) => {
      const { atom } = await import("jotai");
      return {
        ...(await importOriginal<Record<string, unknown>>()),
        detectedSttTokensErrorAtom: atom(() => "Detection failed")
      };
    });
    vi.resetModules();
    const { WorkspaceSidebarView: View } = await import(
      "@/components/user/workspace/workspace-sidebar-view"
    );

    render(<View />);

    expect(
      screen.getByText("Could not load this wallet. Reload the page to try again.")
    ).toBeTruthy();
    expect(screen.queryByText(/not one of yours/)).toBeNull();
  });
});
