import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { buildErrorAtom, buildErrorStaleInputsAtom, previewAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { WorkspaceActionsProvider } from "@/components/user/workspace/workspace-actions-context";
import { computeActionSignature, type BuildActionSignatureCtx } from "@/components/user/workspace/workspace-action-signature";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { prepareStreamingPaymentPayout } from "@/components/user/workspace/workspace-payout-preparation";
import type { PermissionWalletWorkspaceState } from "@/components/user/workspace/use-permission-wallet-workspace-state";
import { EMPTY_CONTRACT_CONFIG, type BuildResult, type PayoutTransfer } from "@/lib/types/contracts";

import { WorkspaceReviewRailView } from "./workspace-review-rail-view";

vi.mock("@/components/user/review-panel", () => ({
  UserReviewPanel: (props: { buildError?: string | null }) => (
    <div data-testid="user-review-panel" data-build-error={props.buildError ?? ""}>
      Review panel
    </div>
  )
}));

function payoutTransfer(quantity: string): PayoutTransfer {
  return {
    address: "addr_test1vrpayout",
    amount: [{ unit: "lovelace", quantity }]
  };
}

function payoutSignature(quantity: string): string {
  return computeActionSignature(
    "payout-streaming-payment",
    {
      activePaymentKeyHash: "payment-key-hash",
      config: EMPTY_CONTRACT_CONFIG,
      selectedDetectedToken: null,
      selectedDetectedTokenStateForm: null,
      sttAuthorityPath: "admin",
      sttExtraTransfers: [],
      sttInputOutputIndex: "0",
      sttInputTxHash: "a".repeat(64),
      sttOutputAssets: [],
      sttProofOfLifeOverrideMode: "unchanged",
      sttProofOfLifeSpecificDateTime: "",
      sttStateForm: {},
      sttWalletInputs: [],
      sttWalletOutputs: [],
      sttZeroAdminConfirmed: false,
      streamingPaymentPayout: prepareStreamingPaymentPayout([payoutTransfer(quantity)])
    } as unknown as BuildActionSignatureCtx
  );
}

function renderRail(options: {
  previewMatchesSelectedAction: boolean;
  buildSelectedActionTx: ReturnType<typeof vi.fn>;
  handleSaveProposalFromBuild: ReturnType<typeof vi.fn>;
  refreshWorkspaceSummary?: ReturnType<typeof vi.fn>;
  seedStore?: (store: ReturnType<typeof createStore>) => void;
}) {
  const store = createStore();
  store.set(
    routeStateAtom,
    parseWorkspaceRouteState(
      new URLSearchParams("wallet=policyasset&action=payout-streaming-payment")
    )
  );
  store.set(previewAtom, { txHex: "old-payout-tx" } as BuildResult);
  options.seedStore?.(store);

  const state = {
    actionDrafts: {
      "payout-streaming-payment": { summary: "Pay scheduled payments" }
    },
    activeActionDefinition: {},
    activeActionDraft: { nextStep: "Review" },
    activeFieldErrors: {},
    activeReadinessIssues: [],
    buildAndSubmitSelectedActionTx: vi.fn(),
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

describe("scheduled payout proposal reuse", () => {
  it("rebuilds instead of saving the old capture when only the payout amount changed", async () => {
    const oldSignature = payoutSignature("1000000");
    const currentSignature = payoutSignature("2000000");
    const buildSelectedActionTx = vi.fn().mockResolvedValue({ txHex: "new-payout-tx" });
    const handleSaveProposalFromBuild = vi.fn();
    expect(currentSignature).not.toBe(oldSignature);
    renderRail({
      previewMatchesSelectedAction: oldSignature === currentSignature,
      buildSelectedActionTx,
      handleSaveProposalFromBuild
    });

    fireEvent.click(screen.getByRole("button", { name: "Save as approval request" }));

    await waitFor(() => expect(buildSelectedActionTx).toHaveBeenCalledOnce());
    expect(handleSaveProposalFromBuild).toHaveBeenCalledWith("new-payout-tx");
    expect(handleSaveProposalFromBuild).not.toHaveBeenCalledWith("old-payout-tx");
  });

  it("reuses the capture when the payout amount still matches", async () => {
    const buildSelectedActionTx = vi.fn();
    const handleSaveProposalFromBuild = vi.fn();
    renderRail({
      previewMatchesSelectedAction:
        payoutSignature("1000000") === payoutSignature("1000000"),
      buildSelectedActionTx,
      handleSaveProposalFromBuild
    });

    fireEvent.click(screen.getByRole("button", { name: "Save as approval request" }));

    await waitFor(() => expect(handleSaveProposalFromBuild).toHaveBeenCalledOnce());
    expect(handleSaveProposalFromBuild).toHaveBeenCalledWith();
    expect(buildSelectedActionTx).not.toHaveBeenCalled();
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
