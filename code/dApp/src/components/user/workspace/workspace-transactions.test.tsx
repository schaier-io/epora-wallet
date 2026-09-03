import { createStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";
import { lockFundsAssetsAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";
import { streamingPaymentPayoutAmountsAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";

const mocks = vi.hoisted(() => ({ signAndSubmitTx: vi.fn() }));

vi.mock("@/lib/mesh/transactions", () => ({ signAndSubmitTx: mocks.signAndSubmitTx }));
vi.mock("@/components/user/workspace/workspace-transaction-refresh", () => ({
  schedulePostSubmitRefresh: vi.fn()
}));

import { createWorkspaceTransactions } from "./workspace-transactions";

function contextFor(store: ReturnType<typeof createStore>, editDuringBuild: (() => void) | null) {
  const setBuildError = vi.fn();
  const ctx = {
    activeBuild: null,
    activeSubmit: false,
    activeFieldErrors: {},
    activeReadinessIssues: [],
    activeWallet: {},
    activeWalletName: "lace",
    addSubmittedTransactionToActivity: vi.fn().mockResolvedValue(undefined),
    isDemoWallet: false,
    jotaiStore: store,
    lockingContract: { address: "addr_test1lock" },
    networkId: 0,
    proposalCaptureRef: { current: null },
    refreshLockedContractUtxos: vi.fn().mockResolvedValue(undefined),
    refreshPermissionWalletSummaries: vi.fn().mockResolvedValue(undefined),
    refreshWalletBalance: vi.fn().mockResolvedValue(undefined),
    rememberRecipients: vi.fn(),
    selectedAction: "lock-funds",
    setActiveSubmit: vi.fn(),
    setBuildError,
    setBuildErrorExpected: vi.fn(),
    setMintConfirmation: vi.fn(),
    setMintedWalletName: vi.fn(),
    setSubmitHash: vi.fn(),
    submitHash: null,
    submitInFlightRef: { current: false },
    watchMintCreationConfirmation: vi.fn(),
    withBuildGuard: async () => {
      editDuringBuild?.();
      return { txHex: "84a1", preview: { action: "lock-funds", summary: "" } };
    }
  } as unknown as WorkspaceTransactionsCtx;
  return { ctx, setBuildError };
}

beforeEach(() => {
  mocks.signAndSubmitTx.mockReset().mockResolvedValue("ff".repeat(32));
});

it("refuses to sign when the draft changed while the transaction was being built", async () => {
  // Build-then-submit skipped the staleness check, so the wallet signed the click-time
  // draft while the screen showed the edit.
  const store = createStore();
  const { ctx, setBuildError } = contextFor(store, () =>
    store.set(lockFundsAssetsAtom, [{ unit: "lovelace", quantity: "5000000" }])
  );
  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();

  expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
  expect(setBuildError).toHaveBeenCalledWith(expect.stringMatching(/stale/i));
});

it("treats an edited payout amount as a changed draft", async () => {
  // The payout amounts feed the build through a derived atom, so the snapshot has to
  // read the editable atom itself or a mid-build edit passes the check.
  const store = createStore();
  const { ctx, setBuildError } = contextFor(store, () =>
    store.set(streamingPaymentPayoutAmountsAtom, { "1": "1000000" })
  );
  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();

  expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
  expect(setBuildError).toHaveBeenCalledWith(expect.stringMatching(/stale/i));
});

it("signs the freshly built transaction when the draft held still", async () => {
  const { ctx, setBuildError } = contextFor(createStore(), null);
  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();

  expect(mocks.signAndSubmitTx).toHaveBeenCalledWith({}, "84a1");
  expect(setBuildError).not.toHaveBeenCalledWith(expect.stringMatching(/stale/i));
});
