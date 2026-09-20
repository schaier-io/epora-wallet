import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";

import { useUserFlowState } from "@/components/user/use-user-flow-state";
import type { FieldErrors, SetupState, UserActionKind } from "@/components/user/flow-types";
import { USER_ACTION_DEFINITIONS } from "@/lib/user-flow/action-definitions";

// The display gate hides field errors on a form the user has not touched yet. It must not
// touch the build gate: `activeFieldErrors` / `activeReadinessIssues` stay raw, because the
// builders assume the validator already ran. See the comment in `use-user-flow-state.ts`.

const READY_SETUP: SetupState = {
  walletName: "Test wallet",
  activeAddress: "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6",
  paymentKeyHash: "aa".repeat(28),
  networkId: 0,
  walletReady: true,
  hasDetectedToken: true,
  sharedSttReferenceStatus: "ready",
  sharedSttReferenceRef: "ef".repeat(32) + "#0",
  sharedSttReferenceStoreAddress: "addr_test1store",
  sharedSttReferenceError: null,
  lockingContractAddress: "addr_test1locking",
  lockingContractError: null,
  lockedUtxoCount: 1,
  lockedUtxosLoading: false
};

const DRAFT_CONTEXT = {
  mint: {
    adminUserCount: 1, currentStateJson: "{}", defaultStateJson: "{}",
    starterFundsJson: "[]", defaultStarterFundsJson: "[]", starterFundsSummary: ""
  },
  stt: {
    inputHash: "", walletInputCount: 0, walletOutputCount: 0, transferCount: 0,
    streamingPaymentTransferCount: 0, authorityPath: "admin" as const, detectedTokenActive: true
  },
  useAllowance: { matchedUserId: null },
  consolidate: {
    inputHash: "", walletInputCount: 0, walletOutputCount: 0, authorityPath: "admin" as const
  },
  lockFunds: { assetCount: 0, hasCustomInlineDatum: false },
  walletWithdraw: { rewardAddress: "", amount: "", sttInputHash: "", authorityPath: "admin" as const },
  walletPublish: { certificateJson: "", sttInputHash: "", authorityPath: "admin" as const },
  walletVote: { voteJson: "", sttInputHash: "", authorityPath: "admin" as const }
};

const VOTE_ERRORS: FieldErrors = { "Vote JSON": ["Paste the vote first."] };
const MINT_ERRORS: FieldErrors = { "Wallet name": ["Name the wallet first."] };

function errorsMap(): Record<UserActionKind, FieldErrors> {
  return USER_ACTION_DEFINITIONS.reduce((accumulator, definition) => {
    accumulator[definition.kind] =
      definition.kind === "wallet-vote" ? VOTE_ERRORS
        : definition.kind === "mint" ? MINT_ERRORS
        : {};
    return accumulator;
  }, {} as Record<UserActionKind, FieldErrors>);
}

// One mutable form value stands in for the whole draft: the hook only ever compares the
// signature string it is handed, exactly as the preview comparison does.
function render(initial: { action: UserActionKind; formValue: string }) {
  const map = errorsMap();
  return renderHook(
    (props: { action: UserActionKind; formValue: string }) =>
      useUserFlowState({
        setupState: READY_SETUP,
        actionFieldErrorsMap: map,
        selectedAction: props.action,
        preview: null,
        previewSignature: null,
        lastActionLabel: "",
        getBuildActionSignature: (action) => `${action}:${props.formValue}`,
        draftContext: DRAFT_CONTEXT
      }),
    { initialProps: initial }
  );
}

function fieldIssueCount(issues: { key?: string }[]) {
  // Field issues are the ones with no prerequisite key; prerequisites always carry one.
  return issues.filter((issue) => !issue.key).length;
}

it("hides field errors on an untouched form while the build gate still sees them", () => {
  const { result } = render({ action: "wallet-vote", formValue: "" });

  expect(result.current.visibleFieldErrors).toEqual({});
  expect(fieldIssueCount(result.current.visibleReadinessIssues)).toBe(0);
  // The gate's own inputs are untouched: a pristine invalid vote stays un-buildable.
  expect(result.current.activeFieldErrors).toEqual(VOTE_ERRORS);
  expect(fieldIssueCount(result.current.activeReadinessIssues)).toBe(1);
  expect(result.current.activeReadinessIssues.some((issue) => issue.blocking)).toBe(true);
});

it("shows a field error as soon as the user edits the form, and hides it again on undo", () => {
  const { result, rerender } = render({ action: "wallet-vote", formValue: "" });

  rerender({ action: "wallet-vote", formValue: "{" });
  expect(result.current.visibleFieldErrors).toEqual(VOTE_ERRORS);
  expect(fieldIssueCount(result.current.visibleReadinessIssues)).toBe(1);

  rerender({ action: "wallet-vote", formValue: "" });
  expect(result.current.visibleFieldErrors).toEqual({});
});

it("does not carry one action's touched state onto another", () => {
  const { result, rerender } = render({ action: "wallet-vote", formValue: "" });

  rerender({ action: "wallet-vote", formValue: "{" });
  expect(result.current.visibleFieldErrors).toEqual(VOTE_ERRORS);

  // Switching re-captures the fingerprint, so mint opens clean even though the signature
  // string differs from the one captured for the vote.
  rerender({ action: "mint", formValue: "{" });
  expect(result.current.visibleFieldErrors).toEqual({});
  expect(result.current.activeFieldErrors).toEqual(MINT_ERRORS);

  rerender({ action: "mint", formValue: "{}" });
  expect(result.current.visibleFieldErrors).toEqual(MINT_ERRORS);
});
