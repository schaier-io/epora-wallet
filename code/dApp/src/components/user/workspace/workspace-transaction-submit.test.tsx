import { resetAllFlowAtom } from "./atoms/transaction-flow.atoms";
import { schedulePostSubmitRefresh } from "./workspace-transaction-refresh";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { currentRecoveryCapacityFailureAtom } from "./atoms/recovery-capacity.atoms";
import { beneficiaryPreparationActiveAtom, consolidateWalletInputsAtom } from "./atoms/forms/consolidate-form.atoms";
import { createStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";
import { sttWalletInputsAtom } from "./atoms/forms/stt-spend-form.atoms";
import type { BuildResult } from "@/lib/types/contracts";

const mocks = vi.hoisted(() => ({ signAndSubmitTx: vi.fn() }));

vi.mock("@/lib/mesh/transactions", () => ({ signAndSubmitTx: mocks.signAndSubmitTx }));
vi.mock("@/components/user/workspace/workspace-transaction-refresh", () => ({
  schedulePostSubmitRefresh: vi.fn()
}));

import { createWorkspaceTransactionSubmit } from "./workspace-transaction-submit";
import { writeRecentRecipientsToStorage } from "./helpers/recent-recipients";

const TX_HASH = "ab".repeat(32);
const preview = {
  txHex: "84a1",
  preview: { action: "use", summary: "Send funds" }
} as unknown as BuildResult;

function makeDeps(overrides: Record<string, unknown> = {}) {
  const deps = {
    activeWallet: {},
    activeWalletName: "Lace",
    isDemoWallet: false,
    networkId: 0,
    jotaiStore: createStore(),
    selectedAction: "use",
    preview,
    previewMatchesSelectedAction: true,
    submitHash: null,
    submitInFlightRef: { current: null },
    setActiveSubmit: vi.fn(),
    setBuildError: vi.fn(),
    setBuildErrorExpected: vi.fn(),
    setSubmitHash: vi.fn(),
    setMintConfirmation: vi.fn(),
    setMintedWalletName: vi.fn(),
    addSubmittedTransactionToActivity: vi.fn().mockResolvedValue(undefined),
    rememberRecipients: vi.fn(),
    refreshDetectedTokens: vi.fn().mockResolvedValue({ tokens: [] }),
    refreshLockedContractUtxos: vi.fn().mockResolvedValue(undefined),
    refreshPermissionWalletSummaries: vi.fn().mockResolvedValue(undefined),
    refreshWalletBalance: vi.fn().mockResolvedValue(undefined),
    lockingContract: { address: "addr_test1lock" },
    postSubmitRefreshTimersRef: { current: [] },
    watchMintCreationConfirmation: vi.fn().mockResolvedValue(undefined),
    mintStateForm: { walletName: "Test wallet" },
    sttExtraTransfers: [{ address: "addr_test1recipient", amount: [] }],
    ...overrides
  } as unknown as Parameters<typeof createWorkspaceTransactionSubmit>[0];
  return deps;
}

beforeEach(() => {
  mocks.signAndSubmitTx.mockReset().mockResolvedValue(TX_HASH);
});

it("ignores unavailable local storage when saving recent recipients", () => {
  const browserWindow = window;
  vi.stubGlobal("window", {
    localStorage: {
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
    }
  });

  try {
    expect(() => writeRecentRecipientsToStorage(["addr_test1recipient"])).not.toThrow();
  } finally {
    vi.stubGlobal("window", browserWindow);
  }
});

it("keeps a submitted transaction successful when recipient bookkeeping throws", async () => {
  const deps = makeDeps({
    rememberRecipients: vi.fn(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    })
  });

  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);

  expect(deps.setSubmitHash).toHaveBeenCalledWith(TX_HASH);
  expect(deps.setBuildError).toHaveBeenCalledTimes(1);
  expect(deps.setBuildError).toHaveBeenCalledWith(null);
  expect(deps.setActiveSubmit).toHaveBeenLastCalledWith(false);
  expect(deps.submitInFlightRef.current).toBeNull();
});

it("handles a rejected follow-up read separately from transaction submission", async () => {
  const readError = new Error("Indexer unavailable");
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const deps = makeDeps({
    refreshPermissionWalletSummaries: vi.fn().mockRejectedValue(readError)
  });

  try {
    await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
    await Promise.resolve();

    expect(deps.setSubmitHash).toHaveBeenCalledWith(TX_HASH);
    expect(deps.setBuildError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("[post-submit:wallet-summaries]", readError);
  } finally {
    consoleError.mockRestore();
  }
});

it("represents a mint whose transaction hash is not known yet with null", async () => {
  let resolveSubmit!: (txHash: string) => void;
  mocks.signAndSubmitTx.mockImplementation(
    () => new Promise<string>((resolve) => { resolveSubmit = resolve; })
  );
  const deps = makeDeps({ selectedAction: "mint" });
  const submission = createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);

  try {
    expect(deps.setMintConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ txHash: null, phase: "submitting" })
    );
  } finally {
    resolveSubmit(TX_HASH);
    await submission;
  }
});

it("signs a warned transaction only after explicit approval", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const warnedPreview = {
    ...preview,
    warnings: [
      "ADA payout top-up: extra sent to the payee 7 ADA."
    ]
  };
  const deps = makeDeps({ preview: warnedPreview });

  try {
    await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(
      warnedPreview
    );
    expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(
      warnedPreview
    );

    expect(confirm).toHaveBeenCalledWith(
      "Review these warnings before you sign:\n\n" +
        "ADA payout top-up: extra sent to the payee 7 ADA.\n\n" +
        "Continue?"
    );
    expect(mocks.signAndSubmitTx).toHaveBeenCalledWith({}, "84a1");
  } finally {
    confirm.mockRestore();
  }
});

it("clears the consumed distribution input after submission so another can be selected", async () => {
  const deps = makeDeps({ selectedAction: "distribute-beneficiaries" });
  deps.jotaiStore.set(sttWalletInputsAtom, [{ txHash: "aa".repeat(32), outputIndex: 0 }]);
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(mocks.signAndSubmitTx).toHaveBeenCalledOnce();
  expect(deps.jotaiStore.get(sttWalletInputsAtom)).toEqual([]);
  expect(deps.rememberRecipients).not.toHaveBeenCalled();
});

it("a signed-size failure offers fallback only for the reviewed permanent Exit", async () => {
  const deps = makeDeps({ selectedAction: "exit-beneficiary" });
  deps.jotaiStore.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("mode=existing-wallet&action=exit-beneficiary")));
  mocks.signAndSubmitTx.mockRejectedValueOnce(new Error("Serialized transaction uses 17000 bytes. The protocol limit is 16384."));
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(deps.jotaiStore.get(currentRecoveryCapacityFailureAtom)?.kind).toBe("bytes");
  expect(deps.setSubmitHash).not.toHaveBeenCalled();
});
it("a signed transaction failure after a wallet switch cannot offer fallback", async () => {
  const deps = makeDeps({ selectedAction: "exit-beneficiary" });
  deps.jotaiStore.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("mode=existing-wallet&action=exit-beneficiary")));
  mocks.signAndSubmitTx.mockImplementationOnce(() => {
    deps.jotaiStore.set(routeStateAtom, { ...deps.jotaiStore.get(routeStateAtom), selectedWalletUnit: "different-wallet" });
    return Promise.reject(new Error("Serialized transaction uses 17000 bytes. The protocol limit is 16384."));
  });
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(deps.jotaiStore.get(currentRecoveryCapacityFailureAtom)).toBeNull();
});
it("successful preparation clears selected inputs while keeping preparation available", async () => {
  const deps = makeDeps({ selectedAction: "consolidate-utxo" });
  deps.jotaiStore.set(beneficiaryPreparationActiveAtom, true);
  deps.jotaiStore.set(consolidateWalletInputsAtom, [{ txHash: "aa".repeat(32), outputIndex: 0 }]);
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(deps.jotaiStore.get(consolidateWalletInputsAtom)).toEqual([]);
  expect(deps.jotaiStore.get(beneficiaryPreparationActiveAtom)).toBe(true);
});

for (const transition of ["wallet switch", "unmount"] as const) {
  for (const outcome of ["success", "failure"] as const) {
    it(`ignores submit ${outcome} after ${transition}`, async () => {
      const deps = makeDeps();
      vi.mocked(schedulePostSubmitRefresh).mockClear();
      let settle!: () => void;
      mocks.signAndSubmitTx.mockImplementationOnce(() => new Promise((resolve, reject) => {
        settle = () => outcome === "success" ? resolve(TX_HASH) : reject(new Error("late submit failure"));
      }));
      const pending = createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
      if (transition === "unmount") deps.jotaiStore.set(resetAllFlowAtom);
      else deps.jotaiStore.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("wallet=wallet-b")));
      settle();
      await pending;
      expect(deps.setSubmitHash).not.toHaveBeenCalled();
      expect(deps.setBuildError).toHaveBeenCalledExactlyOnceWith(null);
      expect(deps.setActiveSubmit).toHaveBeenCalledExactlyOnceWith(true);
      expect(deps.refreshLockedContractUtxos).not.toHaveBeenCalled();
      expect(deps.refreshWalletBalance).not.toHaveBeenCalled();
      expect(schedulePostSubmitRefresh).not.toHaveBeenCalled();
      expect(deps.submitInFlightRef.current).toBeNull();
    });
  }
}

for (const firstToSettle of ["old wallet", "new wallet"] as const) {
  for (const oldOutcome of ["success", "failure"] as const) {
    it(`allows the new wallet to submit when ${firstToSettle} settles first and the old submission is a ${oldOutcome}`, async () => {
      let settleOld!: () => void;
      let settleNew!: () => void;
      const newHash = "cd".repeat(32);
      mocks.signAndSubmitTx
        .mockImplementationOnce(() => new Promise<string>((resolve, reject) => {
          settleOld = () => oldOutcome === "success" ? resolve(TX_HASH) : reject(new Error("late failure"));
        }))
        .mockImplementationOnce(() => new Promise<string>((resolve) => {
          settleNew = () => resolve(newHash);
        }));
      const oldDeps = makeDeps();
      const oldSubmit = createWorkspaceTransactionSubmit(oldDeps);
      const oldPending = oldSubmit.submitTransactionPreview(preview);
      await oldSubmit.submitTransactionPreview(preview);
      expect(mocks.signAndSubmitTx).toHaveBeenCalledTimes(1);

      oldDeps.jotaiStore.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("wallet=wallet-b")));
      const newDeps = makeDeps({
        activeWallet: { name: "wallet-b" },
        jotaiStore: oldDeps.jotaiStore,
        submitInFlightRef: oldDeps.submitInFlightRef
      });
      const newSubmit = createWorkspaceTransactionSubmit(newDeps);
      const newPending = newSubmit.submitTransactionPreview(preview);
      try {
        expect(mocks.signAndSubmitTx).toHaveBeenCalledTimes(2);
        expect(mocks.signAndSubmitTx).toHaveBeenLastCalledWith(newDeps.activeWallet, preview.txHex);
        if (firstToSettle === "old wallet") {
          settleOld();
          await oldPending;
          expect(newDeps.setActiveSubmit).toHaveBeenCalledExactlyOnceWith(true);
          await newSubmit.submitTransactionPreview(preview);
          expect(mocks.signAndSubmitTx).toHaveBeenCalledTimes(2);
          settleNew();
          await newPending;
        } else {
          settleNew();
          await newPending;
          settleOld();
          await oldPending;
        }
        expect(oldDeps.setSubmitHash).not.toHaveBeenCalled();
        expect(oldDeps.setBuildError).toHaveBeenCalledExactlyOnceWith(null);
        expect(oldDeps.setActiveSubmit).toHaveBeenCalledExactlyOnceWith(true);
        expect(newDeps.setSubmitHash).toHaveBeenCalledExactlyOnceWith(newHash);
        expect(newDeps.setActiveSubmit).toHaveBeenLastCalledWith(false);
      } finally {
        settleOld();
        settleNew?.();
        await Promise.all([oldPending, newPending]);
      }
    });
  }
}
