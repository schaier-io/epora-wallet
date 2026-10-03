import { beneficiaryPreparationActiveAtom } from "./atoms/forms/consolidate-form.atoms";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { activeBuildAtom, activeSubmitAtom, submitPhaseAtom, buildErrorAtom, buildErrorStaleInputsAtom, previewAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { sttStateFormAtom, updateStateFormAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { beginWalletStateUpdateAtom, walletStateSubmissionsAtom } from "@/components/user/workspace/atoms/wallet-state-update.atoms";
import { activeAddressAtom } from "@/providers/wallet.atoms";
import { WorkspaceActionsProvider } from "@/components/user/workspace/workspace-actions-context";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import type { PermissionWalletWorkspaceState } from "@/components/user/workspace/use-permission-wallet-workspace-state";
import type { SigningActionAvailability } from "@/components/user/workspace/workspace-stt-option-derivations";
import { type BuildResult } from "@/lib/types/contracts";

import { REVIEW_DONE_DOUBLE_PRESS_GUARD_MS } from "./constants";
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
  refreshWorkspaceSummary?: ReturnType<typeof vi.fn>;
  seedStore?: (store: ReturnType<typeof createStore>) => void;
  signingAvailability?: typeof signingActions.value;
  buildAndSubmitSelectedActionTx?: ReturnType<typeof vi.fn>;
  submitTransactionPreview?: ReturnType<typeof vi.fn>;
  selectedAction?: string;
  stateOverrides?: Partial<PermissionWalletWorkspaceState>;
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
    txHex: "old-payout-tx"
  } as BuildResult);
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
    // The raw pair. The view gates the approval CTA on these, and shows the two above.
    blockingFieldErrors: {},
    blockingReadinessIssues: [],
    buildAndSubmitSelectedActionTx: options.buildAndSubmitSelectedActionTx ?? vi.fn(),
    buildSelectedActionTx: options.buildSelectedActionTx,
    submitTransactionPreview: options.submitTransactionPreview ?? vi.fn(),
    handleSaveProposalFromBuild: options.handleSaveProposalFromBuild,
    lastActionDisplayLabel: "Pay scheduled payments",
    previewMatchesSelectedAction: options.previewMatchesSelectedAction,
    proposalCaptureRef: createRef<unknown>(),
    refreshWorkspaceSummary: options.refreshWorkspaceSummary ?? vi.fn(),
    reviewContextRows: [],
    reviewPanelDescription: "Review",
    reviewReceipt: { title: "Review", summary: "", items: [] },
    reviewPrimaryActionLabel: "Continue",
    reviewPrimaryActionDisabled: false,
    ...options.stateOverrides
  } as unknown as PermissionWalletWorkspaceState;
  state.proposalCaptureRef.current = {} as never;

  const ui = (value: PermissionWalletWorkspaceState) => (
    <Provider store={store}>
      <WorkspaceActionsProvider value={value}>
        <WorkspaceReviewRailView />
      </WorkspaceActionsProvider>
    </Provider>
  );
  const result = render(ui(state));
  return {
    ...result,
    rerenderState: (overrides: Partial<PermissionWalletWorkspaceState>) =>
      result.rerender(ui({ ...state, ...overrides }))
  };
}

it("shows and disables wallet-state refresh across action navigation", () => {
  renderRail({
    selectedAction: "wallet-vote",
    previewMatchesSelectedAction: false,
    buildSelectedActionTx: vi.fn(),
    handleSaveProposalFromBuild: vi.fn(),
    seedStore: (store) => {
      const walletUnit = "ab".repeat(28) + "01";
      store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: walletUnit });
      store.set(beginWalletStateUpdateAtom, {
        walletUnit,
        submittedTxHash: "aa".repeat(32),
        spentRef: { txHash: "bb".repeat(32), outputIndex: 0 }
      });
    }
  });

  expect(reviewPanelProps.latest.primaryActionLabel).toBe("Updating wallet state…");
  expect(reviewPanelProps.latest.primaryActionDisabled).toBe(true);
  expect(reviewPanelProps.latest.secondaryActionDisabled).toBe(true);
});

it("keeps the Done acknowledgement live through the wallet-state wait", () => {
  // The acknowledgement is not a second transaction, and the amber banner may be
  // describing exactly this wait, so the button stays enabled and reads as Done.
  const dismiss = vi.fn();
  const combined = vi.fn();
  renderRail({
    selectedAction: "wallet-vote",
    previewMatchesSelectedAction: false,
    buildSelectedActionTx: vi.fn(),
    buildAndSubmitSelectedActionTx: combined,
    handleSaveProposalFromBuild: vi.fn(),
    seedStore: (store) => {
      const walletUnit = "ab".repeat(28) + "01";
      store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: walletUnit });
      store.set(beginWalletStateUpdateAtom, {
        walletUnit,
        submittedTxHash: "aa".repeat(32),
        spentRef: { txHash: "bb".repeat(32), outputIndex: 0 }
      });
    },
    stateOverrides: {
      reviewSubmitAwaitingAcknowledgement: true,
      reviewPrimaryActionLabel: "Done",
      dismissSubmitState: dismiss
    }
  });

  expect(reviewPanelProps.latest.primaryActionLabel).toBe("Done");
  expect(reviewPanelProps.latest.primaryActionDisabled).toBe(false);
  (reviewPanelProps.latest.onPrimaryAction as () => void)();
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(combined).not.toHaveBeenCalled();
});

it("does not start a new transaction when Done is double-clicked", () => {
  // The first press clears the hash, so the same button turns back into the action
  // button under the cursor. The second click of a double-click must not sign again.
  vi.useFakeTimers();
  try {
    const dismiss = vi.fn();
    const combined = vi.fn();
    const build = vi.fn();
    const { rerenderState } = renderRail({
      selectedAction: "wallet-vote",
      previewMatchesSelectedAction: false,
      buildSelectedActionTx: build,
      buildAndSubmitSelectedActionTx: combined,
      handleSaveProposalFromBuild: vi.fn(),
      stateOverrides: {
        reviewSubmitAwaitingAcknowledgement: true,
        reviewPrimaryActionLabel: "Done",
        dismissSubmitState: dismiss
      }
    });

    (reviewPanelProps.latest.onPrimaryAction as () => void)();
    expect(dismiss).toHaveBeenCalledTimes(1);
    rerenderState({ reviewSubmitAwaitingAcknowledgement: false, reviewPrimaryActionLabel: "Vote" });
    (reviewPanelProps.latest.onPrimaryAction as () => void)();
    // The re-armed stack can also put "Save as approval request" under the cursor.
    (reviewPanelProps.latest.onSecondaryAction as () => void)();
    expect(combined).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();

    vi.advanceTimersByTime(REVIEW_DONE_DOUBLE_PRESS_GUARD_MS);
    (reviewPanelProps.latest.onPrimaryAction as () => void)();
    expect(combined).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("dismisses the submitted banner on Done without building anything", () => {
  const dismiss = vi.fn();
  const combined = vi.fn();
  renderRail({
    selectedAction: "wallet-vote",
    previewMatchesSelectedAction: false,
    buildSelectedActionTx: vi.fn(),
    buildAndSubmitSelectedActionTx: combined,
    handleSaveProposalFromBuild: vi.fn(),
    stateOverrides: {
      reviewSubmitAwaitingAcknowledgement: true,
      reviewPrimaryActionLabel: "Done",
      dismissSubmitState: dismiss
    }
  });

  (reviewPanelProps.latest.onPrimaryAction as () => void)();
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(combined).not.toHaveBeenCalled();
});

it("signs a beneficiary withdrawal on the first press even without a built preview", () => {
  const build = vi.fn();
  const submit = vi.fn();
  const combined = vi.fn();
  renderRail({
    selectedAction: "use-beneficiary",
    previewMatchesSelectedAction: false,
    buildSelectedActionTx: build,
    submitTransactionPreview: submit,
    buildAndSubmitSelectedActionTx: combined,
    handleSaveProposalFromBuild: vi.fn(),
    signingAvailability: { canDirectSign: true, directAuthorityPath: "beneficiary", canSaveApprovalRequest: false }
  });
  expect(reviewPanelProps.latest.primaryActionLabel).toBe("Continue");
  (reviewPanelProps.latest.onPrimaryAction as () => void)();
  expect(combined).toHaveBeenCalledWith("beneficiary");
  expect(build).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it("signs a reviewed beneficiary withdrawal on the first press", () => {
  const build = vi.fn();
  const submit = vi.fn();
  const combined = vi.fn();
  renderRail({
    selectedAction: "use-beneficiary",
    previewMatchesSelectedAction: true,
    buildSelectedActionTx: build,
    submitTransactionPreview: submit,
    buildAndSubmitSelectedActionTx: combined,
    handleSaveProposalFromBuild: vi.fn(),
    signingAvailability: { canDirectSign: true, directAuthorityPath: "beneficiary", canSaveApprovalRequest: false }
  });
  expect(reviewPanelProps.latest.primaryActionLabel).toBe("Continue");
  (reviewPanelProps.latest.onPrimaryAction as () => void)();
  expect(combined).toHaveBeenCalledWith("beneficiary");
  expect(build).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it("signs a stream stop on the first press even without a built preview", () => {
  const build = vi.fn();
  const submit = vi.fn();
  const combined = vi.fn();
  renderRail({
    selectedAction: "stop-beneficiary-stream",
    previewMatchesSelectedAction: false,
    buildSelectedActionTx: build,
    submitTransactionPreview: submit,
    buildAndSubmitSelectedActionTx: combined,
    handleSaveProposalFromBuild: vi.fn(),
    signingAvailability: { canDirectSign: true, directAuthorityPath: "beneficiary", canSaveApprovalRequest: false }
  });
  expect(reviewPanelProps.latest.primaryActionLabel).toBe("Continue");
  (reviewPanelProps.latest.onPrimaryAction as () => void)();
  expect(combined).toHaveBeenCalledWith("beneficiary");
  expect(build).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it("signs a reviewed stream stop on the first press", () => {
  const build = vi.fn();
  const submit = vi.fn();
  const combined = vi.fn();
  renderRail({
    selectedAction: "stop-beneficiary-stream",
    previewMatchesSelectedAction: true,
    buildSelectedActionTx: build,
    submitTransactionPreview: submit,
    buildAndSubmitSelectedActionTx: combined,
    handleSaveProposalFromBuild: vi.fn(),
    signingAvailability: { canDirectSign: true, directAuthorityPath: "beneficiary", canSaveApprovalRequest: false }
  });
  (reviewPanelProps.latest.onPrimaryAction as () => void)();
  expect(combined).toHaveBeenCalledWith("beneficiary");
  expect(build).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it("signs an exact distribution on the first press even without a built preview", () => {
  const build = vi.fn();
  const submit = vi.fn();
  const combined = vi.fn();
  renderRail({
    selectedAction: "distribute-beneficiaries",
    previewMatchesSelectedAction: false,
    buildSelectedActionTx: build,
    submitTransactionPreview: submit,
    buildAndSubmitSelectedActionTx: combined,
    handleSaveProposalFromBuild: vi.fn(),
    signingAvailability: { canDirectSign: true, directAuthorityPath: "beneficiary", canSaveApprovalRequest: false }
  });
  expect(reviewPanelProps.latest.primaryActionLabel).toBe("Continue");
  (reviewPanelProps.latest.onPrimaryAction as () => void)();
  expect(combined).toHaveBeenCalledWith("beneficiary");
  expect(build).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it("signs a reviewed exact distribution on the first press", () => {
  const build = vi.fn();
  const submit = vi.fn();
  const combined = vi.fn();
  renderRail({
    selectedAction: "distribute-beneficiaries",
    previewMatchesSelectedAction: true,
    buildSelectedActionTx: build,
    submitTransactionPreview: submit,
    buildAndSubmitSelectedActionTx: combined,
    handleSaveProposalFromBuild: vi.fn(),
    signingAvailability: { canDirectSign: true, directAuthorityPath: "beneficiary", canSaveApprovalRequest: false }
  });
  (reviewPanelProps.latest.onPrimaryAction as () => void)();
  expect(combined).toHaveBeenCalledWith("beneficiary");
  expect(build).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it("signs a recovery preparation on the first press even without a built preview", () => {
  const build = vi.fn();
  const submit = vi.fn();
  const combined = vi.fn();
  renderRail({
    selectedAction: "consolidate-utxo",
    seedStore: store => store.set(beneficiaryPreparationActiveAtom, true),
    previewMatchesSelectedAction: false,
    buildSelectedActionTx: build,
    submitTransactionPreview: submit,
    buildAndSubmitSelectedActionTx: combined,
    handleSaveProposalFromBuild: vi.fn(),
    signingAvailability: { canDirectSign: true, directAuthorityPath: "beneficiary", canSaveApprovalRequest: false }
  });
  expect(reviewPanelProps.latest.primaryActionLabel).toBe("Continue");
  (reviewPanelProps.latest.onPrimaryAction as () => void)();
  expect(combined).toHaveBeenCalledWith("beneficiary");
  expect(build).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it("signs a reviewed recovery preparation on the first press", () => {
  const build = vi.fn();
  const submit = vi.fn();
  const combined = vi.fn();
  renderRail({
    selectedAction: "consolidate-utxo",
    seedStore: store => store.set(beneficiaryPreparationActiveAtom, true),
    previewMatchesSelectedAction: true,
    buildSelectedActionTx: build,
    submitTransactionPreview: submit,
    buildAndSubmitSelectedActionTx: combined,
    handleSaveProposalFromBuild: vi.fn(),
    signingAvailability: { canDirectSign: true, directAuthorityPath: "beneficiary", canSaveApprovalRequest: false }
  });
  (reviewPanelProps.latest.onPrimaryAction as () => void)();
  expect(combined).toHaveBeenCalledWith("beneficiary");
  expect(build).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it.each(["use", "mint"] as const)("signs a %s transaction on the first press even without a built preview", (selectedAction) => {
  const build = vi.fn();
  const submit = vi.fn();
  const combined = vi.fn();
  renderRail({
    selectedAction,
    previewMatchesSelectedAction: false,
    buildSelectedActionTx: build,
    submitTransactionPreview: submit,
    buildAndSubmitSelectedActionTx: combined,
    handleSaveProposalFromBuild: vi.fn()
  });
  expect(reviewPanelProps.latest.primaryActionLabel).toBe("Continue");
  (reviewPanelProps.latest.onPrimaryAction as () => void)();
  expect(combined).toHaveBeenCalledWith("admin");
  expect(build).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it.each(["use", "mint"] as const)("signs a reviewed %s transaction on the first press", (selectedAction) => {
  const build = vi.fn();
  const submit = vi.fn();
  const combined = vi.fn();
  renderRail({
    selectedAction,
    previewMatchesSelectedAction: true,
    buildSelectedActionTx: build,
    submitTransactionPreview: submit,
    buildAndSubmitSelectedActionTx: combined,
    handleSaveProposalFromBuild: vi.fn(),
    stateOverrides: {
      reviewPrimaryActionLabel: "Continue"
    } as unknown as Partial<PermissionWalletWorkspaceState>
  });
  expect(reviewPanelProps.latest.primaryActionLabel).toBe("Continue");
  (reviewPanelProps.latest.onPrimaryAction as () => void)();
  expect(combined).toHaveBeenCalledWith("admin");
  expect(build).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

describe("context-aware signing actions", () => {
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
    expect(reviewPanelProps.latest.secondaryActionLabel).toBe("Save for co-signing");
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

    expect(reviewPanelProps.latest.primaryActionLabel).toBe("Save for co-signing");
    expect(reviewPanelProps.latest.primaryActionKind).toBe("approval");
    expect(reviewPanelProps.latest.secondaryActionLabel).toBeNull();

    const primaryAction = reviewPanelProps.latest.onPrimaryAction as () => void;
    primaryAction();

    await waitFor(() => expect(handleSaveProposalFromBuild).toHaveBeenCalledOnce());
    expect(buildSelectedActionTx).toHaveBeenCalledWith("multisig");
  });

  it.each([
    ["a transaction is submitting", (store: ReturnType<typeof createStore>) => {
      store.set(activeSubmitAtom, true);
    }]
  ])("does not start an approval build while %s", (_label, seedStore) => {
    const buildSelectedActionTx = vi.fn();
    renderRail({
      previewMatchesSelectedAction: false,
      buildSelectedActionTx,
      handleSaveProposalFromBuild: vi.fn(),
      seedStore
    });

    const secondaryAction = reviewPanelProps.latest.onSecondaryAction as () => void;
    expect(reviewPanelProps.latest.secondaryActionDisabled).toBe(true);
    secondaryAction();

    expect(buildSelectedActionTx).not.toHaveBeenCalled();
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

  // The display gate (S1-L) hides field errors on a form the user has not touched. The
  // approval CTA must keep reading the RAW pair, or an untouched invalid draft would arm
  // "Save for co-signing" with nothing on screen to say why it should not.
  it("still blocks the approval action on a pristine invalid draft", () => {
    const buildSelectedActionTx = vi.fn();
    const handleSaveProposalFromBuild = vi.fn();
    renderRail({
      previewMatchesSelectedAction: false,
      buildSelectedActionTx,
      handleSaveProposalFromBuild,
      selectedAction: "wallet-vote",
      stateOverrides: {
        // What the user sees: nothing, because the form is untouched.
        activeFieldErrors: {},
        activeReadinessIssues: [],
        // What the gate sees: the validator's real verdict.
        blockingFieldErrors: { "Vote JSON": ["Paste the vote first."] },
        blockingReadinessIssues: []
      } as unknown as Partial<PermissionWalletWorkspaceState>
    });

    expect(reviewPanelProps.latest.secondaryActionDisabled).toBe(true);
    // The note is derived from the RAW pair, so on a pristine form it appears with no
    // field highlighted. It must therefore not send the reader looking for a highlight.
    expect(reviewPanelProps.latest.approvalActionNote).toBe(
      "Some fields still need a value or a correction. Fix them first. Then this can be saved for the other signers."
    );
    expect(reviewPanelProps.latest.approvalActionNote).not.toMatch(/highlight/i);
    (reviewPanelProps.latest.onSecondaryAction as () => void)();
    expect(buildSelectedActionTx).not.toHaveBeenCalled();
    expect(handleSaveProposalFromBuild).not.toHaveBeenCalled();
  });

  it("still blocks the approval action on a pristine draft with a blocking readiness issue", () => {
    renderRail({
      previewMatchesSelectedAction: false,
      buildSelectedActionTx: vi.fn(),
      handleSaveProposalFromBuild: vi.fn(),
      selectedAction: "wallet-vote",
      stateOverrides: {
        activeFieldErrors: {},
        activeReadinessIssues: [],
        blockingFieldErrors: {},
        blockingReadinessIssues: [
          { id: "x", label: "Vote", description: "Paste the vote first.", status: "error", blocking: true }
        ]
      } as unknown as Partial<PermissionWalletWorkspaceState>
    });

    expect(reviewPanelProps.latest.secondaryActionDisabled).toBe(true);
    expect(reviewPanelProps.latest.approvalActionNote).toBe(
      "Paste the vote first. Then this can be saved for the other signers."
    );
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
          walletName: "Current wallet"
        });
        store.set(updateStateFormAtom, {
          ...store.get(sttStateFormAtom),
          walletName: "Renamed wallet"
        });
      }
    });

    expect(reviewPanelProps.latest.primaryActionDisabled).toBe(false);
    expect(reviewPanelProps.latest.secondaryActionDisabled).toBe(true);
    expect(reviewPanelProps.latest.approvalActionNote).toBe(
      "A saved request cannot rename this wallet. Restore the current name first."
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

  it("adds only what the kept error does not say", () => {
    renderRail({
      previewMatchesSelectedAction: false,
      buildSelectedActionTx: vi.fn(),
      handleSaveProposalFromBuild: vi.fn(),
      refreshWorkspaceSummary: vi.fn(),
      seedStore: seedStaleError
    });

    // The error already names the spent pool and says to reload. The notice must not
    // restate that, and must not claim a fund pool when other spent money caused it.
    expect(screen.getByText("Nothing you entered was discarded, and nothing was sent.")).toBeInTheDocument();
    expect(screen.queryByText(/no longer spendable/)).not.toBeInTheDocument();
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

describe("approval saving during another transaction", () => {
  it.each([
    ["the wallet is signing", null, true]
  ] as const)("blocks saving while %s", (_label, activeBuild, activeSubmit) => {
    const buildSelectedActionTx = vi.fn();
    const handleSaveProposalFromBuild = vi.fn();
    renderRail({
      previewMatchesSelectedAction: true,
      buildSelectedActionTx,
      handleSaveProposalFromBuild,
      seedStore: (store) => {
        store.set(activeBuildAtom, activeBuild);
        store.set(activeSubmitAtom, activeSubmit);
      }
    });

    expect(reviewPanelProps.latest.secondaryActionDisabled).toBe(true);
    expect(reviewPanelProps.latest.approvalActionNote).toBe(
      "Wait for the transaction in progress to finish. Then this can be saved for the other signers."
    );
    (reviewPanelProps.latest.onSecondaryAction as () => void)();
    expect(buildSelectedActionTx).not.toHaveBeenCalled();
    expect(handleSaveProposalFromBuild).not.toHaveBeenCalled();
  });
});


it("keeps background preparation quiet and shows progress after the direct click", async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const submit = vi.fn(() => pending);
  renderRail({
    previewMatchesSelectedAction: false,
    buildSelectedActionTx: vi.fn(),
    handleSaveProposalFromBuild: vi.fn(),
    buildAndSubmitSelectedActionTx: submit,
    seedStore: store => store.set(activeBuildAtom, "payout-streaming-payment")
  });
  expect(reviewPanelProps.latest.isBuilding).toBe(false);
  expect(reviewPanelProps.latest.primaryActionLabel).toBe("Continue");
  expect(reviewPanelProps.latest.primaryActionDisabled).toBe(false);
  expect(reviewPanelProps.latest.autoSignPending).toBe(false);
  act(() => { (reviewPanelProps.latest.onPrimaryAction as () => void)(); });
  expect(submit).toHaveBeenCalledOnce();
  expect(reviewPanelProps.latest.isBuilding).toBe(true);
  expect(reviewPanelProps.latest.primaryActionDisabled).toBe(true);
  expect(reviewPanelProps.latest.autoSignPending).toBe(true);
  expect(reviewPanelProps.latest.primaryActionLabel).toBe("Preparing transaction");
  act(() => { (reviewPanelProps.latest.onPrimaryAction as () => void)(); });
  expect(submit).toHaveBeenCalledOnce();
  await act(async () => { finish(); await pending; });
  expect(reviewPanelProps.latest.isBuilding).toBe(false);
  expect(reviewPanelProps.latest.primaryActionLabel).toBe("Continue");
});


it("promises automatic signing while a recovery build is in flight", async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const combined = vi.fn(() => pending);
  renderRail({
    selectedAction: "use-beneficiary",
    previewMatchesSelectedAction: false,
    buildSelectedActionTx: vi.fn(),
    handleSaveProposalFromBuild: vi.fn(),
    buildAndSubmitSelectedActionTx: combined
  });
  act(() => { (reviewPanelProps.latest.onPrimaryAction as () => void)(); });
  expect(reviewPanelProps.latest.isBuilding).toBe(true);
  expect(reviewPanelProps.latest.autoSignPending).toBe(true);
  await act(async () => { finish(); await pending; });
  expect(reviewPanelProps.latest.isBuilding).toBe(false);
});

it("does not carry clicked progress into another wallet session", async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  let store!: ReturnType<typeof createStore>;
  renderRail({
    previewMatchesSelectedAction: false,
    buildSelectedActionTx: vi.fn(),
    handleSaveProposalFromBuild: vi.fn(),
    buildAndSubmitSelectedActionTx: vi.fn(() => pending),
    seedStore: value => { store = value; }
  });
  act(() => { (reviewPanelProps.latest.onPrimaryAction as () => void)(); });
  expect(reviewPanelProps.latest.isBuilding).toBe(true);
  act(() => { store.set(activeAddressAtom, "addr_test1anotherwallet"); });
  expect(reviewPanelProps.latest.isBuilding).toBe(false);
  expect(reviewPanelProps.latest.autoSignPending).toBe(false);
  await act(async () => { finish(); await pending; });
});

describe("transaction button phase", () => {
  it.each([
    [null, "Checking transaction"],
    ["checking", "Checking transaction"],
    ["signing", "Waiting for wallet signature"],
    ["submitting", "Sending transaction"]
  ] as const)("shows actual %s phase even while State signing gate is active", (phase, label) => {
    renderRail({ previewMatchesSelectedAction: true, buildSelectedActionTx: vi.fn(), handleSaveProposalFromBuild: vi.fn(), seedStore: store => {
      store.set(activeSubmitAtom, true);
      store.set(walletStateSubmissionsAtom, { policyasset: true });
      store.set(submitPhaseAtom, phase);
    } });
    expect(reviewPanelProps.latest.primaryActionLabel).toBe(label);
    expect(reviewPanelProps.latest.isSubmitting).toBe(true);
    expect(reviewPanelProps.latest.isBuilding).toBe(false);
  });
  it("keeps Done ahead of the submit phase", () => {
    renderRail({ previewMatchesSelectedAction: true, buildSelectedActionTx: vi.fn(), handleSaveProposalFromBuild: vi.fn(), stateOverrides: { reviewSubmitAwaitingAcknowledgement: true, reviewPrimaryActionLabel: "Done" }, seedStore: store => {
      store.set(activeSubmitAtom, true);
      store.set(submitPhaseAtom, "signing");
    } });
    expect(reviewPanelProps.latest.primaryActionLabel).toBe("Done");
  });
});


it.each([false, true])("allows approval clicks during a background build (approval only: %s)", async approvalOnly => {
  let finish!: (result: BuildResult) => void;
  const buildSelectedActionTx = vi.fn(() => new Promise<BuildResult>(resolve => { finish = resolve; }));
  const handleSaveProposalFromBuild = vi.fn();
  renderRail({
    previewMatchesSelectedAction: false,
    buildSelectedActionTx,
    handleSaveProposalFromBuild,
    signingAvailability: { canDirectSign: !approvalOnly, directAuthorityPath: "admin", canSaveApprovalRequest: true },
    seedStore: store => store.set(activeBuildAtom, "payout-streaming-payment")
  });
  expect(reviewPanelProps.latest.isBuilding).toBe(false);
  expect(reviewPanelProps.latest[approvalOnly ? "primaryActionDisabled" : "secondaryActionDisabled"]).toBe(false);
  const click = reviewPanelProps.latest[approvalOnly ? "onPrimaryAction" : "onSecondaryAction"] as () => void;
  act(click);
  expect(buildSelectedActionTx).toHaveBeenCalledExactlyOnceWith("multisig");
  expect(reviewPanelProps.latest[approvalOnly ? "primaryActionDisabled" : "secondaryActionDisabled"]).toBe(true);
  act(reviewPanelProps.latest[approvalOnly ? "onPrimaryAction" : "onSecondaryAction"] as () => void);
  expect(buildSelectedActionTx).toHaveBeenCalledTimes(1);
  await act(async () => finish({ txHex: "approval-tx" } as BuildResult));
  expect(handleSaveProposalFromBuild).toHaveBeenCalledExactlyOnceWith("approval-tx");
});
