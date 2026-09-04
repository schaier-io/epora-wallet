import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { buildErrorAtom, buildErrorStaleInputsAtom, previewAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { sttStateFormAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { activeAddressAtom } from "@/providers/wallet.atoms";
import { WorkspaceActionsProvider } from "@/components/user/workspace/workspace-actions-context";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import type { PermissionWalletWorkspaceState } from "@/components/user/workspace/use-permission-wallet-workspace-state";
import type { SigningActionAvailability } from "@/components/user/workspace/workspace-stt-option-derivations";
import { type BuildResult } from "@/lib/types/contracts";

import { WorkspaceReviewRailView } from "./workspace-review-rail-view";

// The mock stub can't close over module scope (vi.mock hoists), so the panel's props
// land here for assertions on what the rail wires through.
const reviewPanelProps = vi.hoisted(() => ({ latest: {} as Record<string, unknown> }));
const signingActions = vi.hoisted(() => ({
  value: {
    canDirectSign: true,
    directAuthorityPath: "admin" as const,
    canSaveApprovalRequest: true
  } as SigningActionAvailability
}));
const approvalRule = vi.hoisted(() => ({ threshold: "2" }));

vi.mock("@/components/user/review-panel", () => ({
  UserReviewPanel: (props: Record<string, unknown>) => {
    reviewPanelProps.latest = props;
    return (
      <div
        data-testid="user-review-panel"
        data-build-error={(props.buildError as string | null | undefined) ?? ""}
      >
        Review panel
      </div>
    );
  }
}));

vi.mock(
  "@/components/user/workspace/atoms/workspace-stt-options.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      selectedSigningActionAvailabilityAtom: atom(() => signingActions.value)
    };
  }
);

vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      activeInferredSttStateFormAtom: atom(() => ({
        multiSigThresholdMode: "some",
        multiSigThreshold: approvalRule.threshold,
        walletName: "Current wallet"
      }))
    };
  }
);

function renderRail(options: {
  previewMatchesSelectedAction: boolean;
  buildSelectedActionTx: ReturnType<typeof vi.fn>;
  handleSaveProposalFromBuild: ReturnType<typeof vi.fn>;
  activeAddress?: string | null;
  previewSignerAddress?: string;
  refreshWorkspaceSummary?: ReturnType<typeof vi.fn>;
  seedStore?: (store: ReturnType<typeof createStore>) => void;
  signingAvailability?: typeof signingActions.value;
  buildAndSubmitSelectedActionTx?: ReturnType<typeof vi.fn>;
  selectedAction?: string;
}) {
  signingActions.value = options.signingAvailability ?? {
    canDirectSign: true,
    directAuthorityPath: "admin",
    canSaveApprovalRequest: true
  };
  const store = createStore();
  store.set(
    routeStateAtom,
    parseWorkspaceRouteState(
      new URLSearchParams(
        `wallet=policyasset&action=${options.selectedAction ?? "payout-streaming-payment"}`
      )
    )
  );
  store.set(previewAtom, {
    txHex: "old-payout-tx",
    signerAddress: options.previewSignerAddress
  } as BuildResult);
  store.set(activeAddressAtom, options.activeAddress ?? null);
  options.seedStore?.(store);
  const selectedAction = options.selectedAction ?? "payout-streaming-payment";

  const state = {
    actionDrafts: {
      [selectedAction]: { summary: "Review the action" }
    },
    activeActionDefinition: {},
    activeActionDraft: { nextStep: "Review" },
    activeFieldErrors: {},
    activeReadinessIssues: [],
    buildAndSubmitSelectedActionTx: options.buildAndSubmitSelectedActionTx ?? vi.fn(),
    buildSelectedActionTx: options.buildSelectedActionTx,
    handleSaveProposalFromBuild: options.handleSaveProposalFromBuild,
    lastActionDisplayLabel: "Pay scheduled payments",
    previewMatchesSelectedAction: options.previewMatchesSelectedAction,
    proposalCaptureRef: createRef<unknown>(),
    refreshWorkspaceSummary: options.refreshWorkspaceSummary ?? vi.fn(),
    reviewContextRows: [],
    reviewPanelDescription: "Review",
    reviewReceipt: { title: "Review", summary: "", items: [] },
    reviewPrimaryActionLabel: "Continue",
    reviewPrimaryActionDisabled: false
  } as unknown as PermissionWalletWorkspaceState;
  state.proposalCaptureRef.current = {} as never;

  return render(
    <Provider store={store}>
      <WorkspaceActionsProvider value={state}>
        <WorkspaceReviewRailView />
      </WorkspaceActionsProvider>
    </Provider>
  );
}

describe("context-aware signing actions", () => {
  it("hands the connected wallet's address to the review panel as the signer", () => {
    renderRail({
      previewMatchesSelectedAction: true,
      buildSelectedActionTx: vi.fn(),
      handleSaveProposalFromBuild: vi.fn(),
      activeAddress: "addr_test1signer"
    });

    expect(reviewPanelProps.latest.signerAddress).toBe("addr_test1signer");
  });

  // `setupTransaction` pins `setRequiredSigners` to its resolved change address,
  // which can differ from `usedAddresses[0]`; the review must name the signer the
  // built tx actually needs, not the address list's first entry.
  it("prefers the build-time signer from the preview when the addresses differ", () => {
    renderRail({
      previewMatchesSelectedAction: true,
      buildSelectedActionTx: vi.fn(),
      handleSaveProposalFromBuild: vi.fn(),
      activeAddress: "addr_test1signer",
      previewSignerAddress: "addr_test1buildtime"
    });

    expect(reviewPanelProps.latest.signerAddress).toBe("addr_test1buildtime");
  });

  it("shows direct signing first and approval saving second for a dual-role wallet", async () => {
    const buildAndSubmitSelectedActionTx = vi.fn();
    const buildSelectedActionTx = vi.fn().mockResolvedValue({ txHex: "new-payout-tx" });
    const handleSaveProposalFromBuild = vi.fn();
    renderRail({
      previewMatchesSelectedAction: false,
      buildSelectedActionTx,
      handleSaveProposalFromBuild,
      buildAndSubmitSelectedActionTx
    });

    const primaryAction = reviewPanelProps.latest.onPrimaryAction as () => void;
    primaryAction();
    expect(buildAndSubmitSelectedActionTx).toHaveBeenCalledWith("admin");

    expect(reviewPanelProps.latest.primaryActionLabel).toBe("Continue");
    expect(reviewPanelProps.latest.secondaryActionLabel).toBe("Save as approval request");
    expect(reviewPanelProps.latest.approvalActionNote).toBe(
      "This rule needs 2 approval power between the co-signers."
    );
    const secondaryAction = reviewPanelProps.latest.onSecondaryAction as () => void;
    secondaryAction();

    await waitFor(() => expect(buildSelectedActionTx).toHaveBeenCalledOnce());
    expect(buildSelectedActionTx).toHaveBeenCalledWith("multisig");
    expect(handleSaveProposalFromBuild).toHaveBeenCalledWith("new-payout-tx");
  });

  it("makes approval saving the primary action for a co-signer-only wallet", async () => {
    const buildSelectedActionTx = vi.fn().mockResolvedValue({ txHex: "request-tx" });
    const handleSaveProposalFromBuild = vi.fn();
    renderRail({
      previewMatchesSelectedAction: false,
      buildSelectedActionTx,
      handleSaveProposalFromBuild,
      signingAvailability: {
        canDirectSign: false,
        directAuthorityPath: null,
        canSaveApprovalRequest: true
      }
    });

    expect(reviewPanelProps.latest.primaryActionLabel).toBe("Save as approval request");
    expect(reviewPanelProps.latest.primaryActionKind).toBe("approval");
    expect(reviewPanelProps.latest.secondaryActionLabel).toBeNull();

    const primaryAction = reviewPanelProps.latest.onPrimaryAction as () => void;
    primaryAction();

    await waitFor(() => expect(handleSaveProposalFromBuild).toHaveBeenCalledOnce());
    expect(buildSelectedActionTx).toHaveBeenCalledWith("multisig");
  });

  it("keeps a single-signer path direct", () => {
    renderRail({
      previewMatchesSelectedAction: false,
      buildSelectedActionTx: vi.fn(),
      handleSaveProposalFromBuild: vi.fn(),
      signingAvailability: {
        canDirectSign: true,
        directAuthorityPath: null,
        canSaveApprovalRequest: false
      }
    });

    expect(reviewPanelProps.latest.primaryActionLabel).toBe("Continue");
    expect(reviewPanelProps.latest.secondaryActionLabel).toBeNull();
    expect(reviewPanelProps.latest.approvalActionNote).toBeNull();
  });

  it("blocks only the approval action when an owner renames the wallet", () => {
    renderRail({
      previewMatchesSelectedAction: false,
      buildSelectedActionTx: vi.fn(),
      handleSaveProposalFromBuild: vi.fn(),
      selectedAction: "update-state",
      seedStore: (store) => {
        store.set(sttStateFormAtom, {
          ...store.get(sttStateFormAtom),
          walletName: "Renamed wallet"
        });
      }
    });

    expect(reviewPanelProps.latest.primaryActionDisabled).toBe(false);
    expect(reviewPanelProps.latest.secondaryActionDisabled).toBe(true);
    expect(reviewPanelProps.latest.approvalActionNote).toBe(
      "Approval requests cannot rename this wallet. Restore the current name first."
    );
  });
});

describe("stale fund-pool recovery", () => {
  const staleError = `Fund pool ${"ab".repeat(32)}#0 has already been spent. Reload the fund pools, remove that one, then try again.`;

  function seedStaleError(store: ReturnType<typeof createStore>) {
    store.set(buildErrorAtom, staleError);
    store.set(buildErrorStaleInputsAtom, true);
  }

  it("offers refresh chain state next to the kept error when a fund pool went stale", async () => {
    const refreshWorkspaceSummary = vi.fn().mockResolvedValue(undefined);
    const buildSelectedActionTx = vi.fn();
    renderRail({
      previewMatchesSelectedAction: false,
      buildSelectedActionTx,
      handleSaveProposalFromBuild: vi.fn(),
      refreshWorkspaceSummary,
      seedStore: seedStaleError
    });

    // The failure is still on the review panel: the draft was not discarded.
    expect(
      screen.getByTestId("user-review-panel").getAttribute("data-build-error")
    ).toBe(staleError);

    // The focused action reloads chain state only; nothing is rebuilt, signed, or sent.
    fireEvent.click(screen.getByRole("button", { name: "Refresh chain state" }));
    await waitFor(() => expect(refreshWorkspaceSummary).toHaveBeenCalledWith(false));
    expect(buildSelectedActionTx).not.toHaveBeenCalled();
  });

  it("reports a rejected refresh with the retry message and keeps the button available", async () => {
    const refreshWorkspaceSummary = vi.fn().mockRejectedValue(new Error("network down"));
    renderRail({
      previewMatchesSelectedAction: false,
      buildSelectedActionTx: vi.fn(),
      handleSaveProposalFromBuild: vi.fn(),
      refreshWorkspaceSummary,
      seedStore: seedStaleError
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh chain state" }));

    // The failure is announced with the localized retry message...
    expect(
      await screen.findByText(
        "The refresh could not complete, so the fund pools are still stale. Check the connection, then press the button to try again."
      )
    ).toBeInTheDocument();
    // ...and the same button stays enabled for the retry it promises.
    const retry = screen.getByRole("button", { name: "Refresh chain state" });
    expect(retry).not.toBeDisabled();
    expect(retry).toHaveAttribute("aria-busy", "false");
  });

  it("does not offer the recovery affordance for a plain failure", () => {
    renderRail({
      previewMatchesSelectedAction: false,
      buildSelectedActionTx: vi.fn(),
      handleSaveProposalFromBuild: vi.fn(),
      seedStore: (store) =>
        store.set(buildErrorAtom, "Connect a browser wallet before continuing")
    });

    expect(
      screen.queryByRole("button", { name: "Refresh chain state" })
    ).not.toBeInTheDocument();
  });
});
