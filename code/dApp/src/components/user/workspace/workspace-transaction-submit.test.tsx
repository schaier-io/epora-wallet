import { workspaceTransactionSnapshotAtom, preparedWorkspaceTransactionAtom } from "./workspace-prepared-transaction";
import { workspaceSessionAtom, buildRunAtom, previewSignatureAtom } from "./atoms/transaction-flow.atoms";
import { lockFundsAssetsAtom } from "./atoms/forms/lock-funds-form.atoms";
import { waitFor } from "@testing-library/react";
import { queryClientAtom } from "jotai-tanstack-query";
import { QueryObserver } from "@tanstack/react-query";
import { createAppQueryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { activeAddressAtom } from "@/providers/wallet.atoms";
import { resetAllFlowAtom, resetFlowAtom, submitHashAtom, submitConfirmedAtom } from "./atoms/transaction-flow.atoms";
import { schedulePostSubmitRefresh } from "./workspace-transaction-refresh";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { currentRecoveryCapacityFailureAtom } from "./atoms/recovery-capacity.atoms";
import { beneficiaryPreparationActiveAtom, consolidateWalletInputsAtom } from "./atoms/forms/consolidate-form.atoms";
import { createStore } from "jotai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  sttInputOutputIndexAtom,
  sttInputTxHashAtom,
  sttWalletInputsAtom
} from "./atoms/forms/stt-spend-form.atoms";
import { beginWalletStateUpdateAtom, pendingWalletStateUpdatesAtom, pendingWalletStateUpdateAtom } from "./atoms/wallet-state-update.atoms";
import { selectedOrphanInputsAtom } from "./atoms/forms/orphan-inputs.atoms";
import type { BuildResult } from "@/lib/types/contracts";

const mocks = vi.hoisted(() => ({ freshness: vi.fn(), signAndSubmitTx: vi.fn() }));

vi.mock("@/lib/mesh/transactions/prepared-transaction-freshness", () => ({ assertPreparedTransactionFresh: mocks.freshness }));
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

const clients: ReturnType<typeof createAppQueryClient>[] = [];
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.useRealTimers(); vi.unstubAllGlobals(); });

function makeDeps(overrides: Record<string, unknown> = {}) {
  const client = createAppQueryClient();
  client.setDefaultOptions({ queries: { retry: false, gcTime: Infinity, staleTime: Infinity } });
  clients.push(client);
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
  deps.jotaiStore.set(queryClientAtom, client);
  return deps;
}

beforeEach(() => {
  localStorage.clear();
  mocks.signAndSubmitTx.mockReset().mockResolvedValue(TX_HASH);
  mocks.freshness.mockReset().mockResolvedValue(undefined);
});

const recoveryDraft = {
  walletUnit: "selected-wallet", signerAddress: "signer",
  outputs: [{ txHash: "orphan", outputIndex: 0, address: "other-stake", lovelace: "1000000", assets: [] }]
};

it("retires the selected recovery outputs after successful submission", async () => {
  vi.useFakeTimers();
  const deps = makeDeps({ selectedAction: "use-beneficiary" });
  deps.jotaiStore.set(selectedOrphanInputsAtom, recoveryDraft);
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(mocks.signAndSubmitTx).toHaveBeenCalledTimes(1);
  expect(deps.jotaiStore.get(selectedOrphanInputsAtom)).toBeNull();
});

it("keeps recovery outputs when the wallet rejects submission", async () => {
  const deps = makeDeps({ selectedAction: "use-beneficiary" });
  deps.jotaiStore.set(selectedOrphanInputsAtom, recoveryDraft);
  mocks.signAndSubmitTx.mockRejectedValueOnce(new Error("User declined signing"));
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(deps.jotaiStore.get(selectedOrphanInputsAtom)).toBe(recoveryDraft);
});

it("does not clear a recovery draft replaced during signing", async () => {
  vi.useFakeTimers();
  const deps = makeDeps({ selectedAction: "use-beneficiary" });
  deps.jotaiStore.set(selectedOrphanInputsAtom, recoveryDraft);
  let finish!: (hash: string) => void;
  mocks.signAndSubmitTx.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
  const pending = createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  const replacement = { ...recoveryDraft, outputs: [] };
  deps.jotaiStore.set(selectedOrphanInputsAtom, replacement);
  finish(TX_HASH);
  await pending;
  expect(deps.jotaiStore.get(selectedOrphanInputsAtom)).toBe(replacement);
});

it("retains the submitted State ref across action navigation for the readiness watcher", async () => {
  vi.useFakeTimers();
  const spent = { txHash: "cd".repeat(32), outputIndex: 1 };
  const walletUnit = `${"12".repeat(28)}01`;
  const deps = makeDeps({ selectedDetectedToken: { unit: walletUnit, utxo: { input: spent } } });
  deps.jotaiStore.set(sttInputTxHashAtom, spent.txHash);
  deps.jotaiStore.set(sttInputOutputIndexAtom, String(spent.outputIndex));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: { hash: TX_HASH } }))));
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  deps.jotaiStore.set(resetFlowAtom);
  await vi.advanceTimersByTimeAsync(12_000);
  expect(deps.jotaiStore.get(pendingWalletStateUpdateAtom)?.spentRef).toEqual(spent);
  expect(deps.jotaiStore.get(sttInputTxHashAtom)).toBe(spent.txHash);
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
  const deps = makeDeps();
  vi.spyOn(deps.jotaiStore.get(queryClientAtom), "invalidateQueries").mockRejectedValueOnce(readError);

  try {
    await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
    await Promise.resolve();

    expect(deps.setSubmitHash).toHaveBeenCalledWith(TX_HASH);
    expect(deps.setBuildError).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith("[post-submit:chain-cache]", readError));
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

it("passes the expected wallet unit into mint confirmation", async () => {
  const createdWalletUnit = `${"aa".repeat(28)}01`;
  const mintPreview = {
    ...preview,
    createdWalletUnit,
    preview: { action: "mint", summary: "Create wallet" }
  } as BuildResult;
  const deps = makeDeps({ selectedAction: "mint", preview: mintPreview });

  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(mintPreview);

  expect(deps.watchMintCreationConfirmation).toHaveBeenCalledWith(TX_HASH, createdWalletUnit);
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
    expect(mocks.signAndSubmitTx).toHaveBeenCalledWith({}, "84a1", { assertCurrent: expect.any(Function) as unknown });
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

it("a signed-size failure offers fallback only for the reviewed beneficiary withdrawal", async () => {
  const deps = makeDeps({ selectedAction: "use-beneficiary" });
  deps.jotaiStore.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("mode=existing-wallet&action=use-beneficiary")));
  mocks.signAndSubmitTx.mockRejectedValueOnce(new Error("Serialized transaction uses 17000 bytes. The protocol limit is 16384."));
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(deps.jotaiStore.get(currentRecoveryCapacityFailureAtom)?.kind).toBe("bytes");
  expect(deps.setSubmitHash).not.toHaveBeenCalled();
});
it("a signed transaction failure after a wallet switch cannot offer fallback", async () => {
  const deps = makeDeps({ selectedAction: "use-beneficiary" });
  deps.jotaiStore.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("mode=existing-wallet&action=use-beneficiary")));
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
        expect(mocks.signAndSubmitTx).toHaveBeenLastCalledWith(newDeps.activeWallet, preview.txHex, { assertCurrent: expect.any(Function) as unknown });
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


it("refreshes all transaction-dependent data when confirmation arrives at 85 seconds", async () => {
  vi.useFakeTimers();
  const started = Date.now();
  vi.stubGlobal("fetch", vi.fn(async () => Date.now() - started < 85_000
    ? new Response(JSON.stringify({ error: "not indexed" }), { status: 404 })
    : new Response(JSON.stringify({ result: { hash: TX_HASH } }))));
  const deps = makeDeps();
  deps.setSubmitHash = vi.fn(hash => deps.jotaiStore.set(submitHashAtom, hash));
  const client = deps.jotaiStore.get(queryClientAtom);
  const keys = [queryKeys.addressUtxos("wallet-a"), queryKeys.sttWallet("policy", "unit"),
    queryKeys.accountInfo("rewards"), [...queryKeys.chain, "wallet-activity", "wallet-a"],
    ["proposals", "preprod", "signer", "verification", "request"]];
  const reads = keys.map(() => vi.fn(async () => Date.now()));
  const observers = keys.map((key, index) => {
    client.setQueryData(key, started);
    const observer = new QueryObserver(client, { queryKey: key, queryFn: reads[index],
      ...(index === 4 ? { meta: { chainDependent: true } } : {}) });
    return { observer, stop: observer.subscribe(() => {}) };
  });
  const realRefresh = await vi.importActual<{ schedulePostSubmitRefresh: typeof schedulePostSubmitRefresh }>("./workspace-transaction-refresh");
  try {
    await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
    realRefresh.schedulePostSubmitRefresh(deps);
    await vi.advanceTimersByTimeAsync(75_000);
    expect(deps.jotaiStore.get(submitConfirmedAtom)).toBe(false);
    reads.forEach(read => { expect(read).toHaveBeenCalledTimes(5); read.mockClear(); });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.jotaiStore.get(submitConfirmedAtom)).toBe(true);
    reads.forEach(read => expect(read).toHaveBeenCalledTimes(1));
    observers.forEach(({ observer }) => expect(observer.getCurrentResult().data).toBe(started + 85_000));
  } finally { observers.forEach(({ stop }) => stop()); }
});

it("cannot publish confirmation after the signer changes during its pending read", async () => {
  vi.useFakeTimers();
  let resolveRead!: (response: Response) => void;
  const fetchRead = vi.fn(() => new Promise<Response>(resolve => { resolveRead = resolve; }));
  vi.stubGlobal("fetch", fetchRead);
  const deps = makeDeps();
  deps.setSubmitHash = vi.fn(hash => deps.jotaiStore.set(submitHashAtom, hash));
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(fetchRead).toHaveBeenCalledOnce();
  const client = deps.jotaiStore.get(queryClientAtom);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  deps.jotaiStore.set(activeAddressAtom, "account-b");
  resolveRead(new Response(JSON.stringify({ result: { hash: TX_HASH } })));
  await vi.advanceTimersByTimeAsync(1);
  expect(deps.jotaiStore.get(submitConfirmedAtom)).toBe(false);
  expect(invalidate).not.toHaveBeenCalled();
});

function bindPreview(deps: ReturnType<typeof makeDeps>) {
  const store = deps.jotaiStore;
  store.set(preparedWorkspaceTransactionAtom, {
    result: preview, snapshot: store.get(workspaceTransactionSnapshotAtom),
    session: store.get(workspaceSessionAtom), buildRun: store.get(buildRunAtom),
    builtAt: Date.now(), proposalCapture: null
  });
  store.set(previewSignatureAtom, "current");
}

it("checks the live draft again after asynchronous chain validation", async () => {
  const deps = makeDeps();
  bindPreview(deps);
  const sign = vi.fn();
  mocks.freshness.mockImplementationOnce(async () => {
    deps.jotaiStore.set(lockFundsAssetsAtom, [{ unit: "lovelace", quantity: "7" }]);
  });
  mocks.signAndSubmitTx.mockImplementationOnce(async (_wallet, _hex, options: { assertCurrent: () => Promise<void> }) => {
    await options.assertCurrent();
    sign();
    return TX_HASH;
  });
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(sign).not.toHaveBeenCalled();
  expect(deps.setBuildError).toHaveBeenCalledWith(expect.stringMatching(/stale/i), expect.anything());
  expect(deps.jotaiStore.get(preparedWorkspaceTransactionAtom)).toBeNull();
});

it("blocks submission if the user edits while the wallet prompt is open", async () => {
  const deps = makeDeps();
  bindPreview(deps);
  const sign = vi.fn(), submit = vi.fn();
  mocks.signAndSubmitTx.mockImplementationOnce(async (_wallet, _hex, options: { assertCurrent: () => Promise<void> }) => {
    await options.assertCurrent();
    sign();
    deps.jotaiStore.set(lockFundsAssetsAtom, [{ unit: "lovelace", quantity: "8" }]);
    await options.assertCurrent();
    submit();
    return TX_HASH;
  });
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(sign).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
});

it("fails closed if the preview has no preparation metadata", async () => {
  const deps = makeDeps();
  const sign = vi.fn();
  mocks.signAndSubmitTx.mockImplementationOnce(async (_wallet, _hex, options: { assertCurrent: () => Promise<void> }) => {
    await options.assertCurrent();
    sign();
    return TX_HASH;
  });
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(sign).not.toHaveBeenCalled();
  expect(mocks.freshness).not.toHaveBeenCalled();
});

it("invalidates the preview when a chain freshness check fails", async () => {
  const deps = makeDeps();
  bindPreview(deps);
  mocks.freshness.mockRejectedValueOnce(new Error("input was already spent"));
  mocks.signAndSubmitTx.mockImplementationOnce(async (_wallet, _hex, options: { assertCurrent: () => Promise<void> }) => {
    await options.assertCurrent();
    return TX_HASH;
  });
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(deps.jotaiStore.get(preparedWorkspaceTransactionAtom)).toBeNull();
  expect(deps.jotaiStore.get(previewSignatureAtom)).toBeNull();
  expect(deps.setSubmitHash).not.toHaveBeenCalled();
});

// #433: a pending State update must block signing, including an old callback.
it("does not sign another preview while the wallet State is pending", async () => {
  const deps = makeDeps();
  deps.jotaiStore.set(pendingWalletStateUpdateAtom, {
    walletUnit: "ab".repeat(28) + "01", submittedTxHash: TX_HASH,
    spentRef: { txHash: "cd".repeat(32), outputIndex: 0 }
  });
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
});

it("an old wallet callback cannot bypass its wait after selecting another wallet", async () => {
  const unit = "ab".repeat(28) + "01";
  const deps = makeDeps({ selectedDetectedToken: { unit, utxo: { input: { txHash: TX_HASH, outputIndex: 0 } } } });
  deps.jotaiStore.set(routeStateAtom, { ...deps.jotaiStore.get(routeStateAtom), selectedWalletUnit: unit });
  const old = createWorkspaceTransactionSubmit(deps);
  deps.jotaiStore.set(pendingWalletStateUpdateAtom, { walletUnit: unit, submittedTxHash: TX_HASH, spentRef: { txHash: "cd".repeat(32), outputIndex: 0 } });
  deps.jotaiStore.set(routeStateAtom, { ...deps.jotaiStore.get(routeStateAtom), selectedWalletUnit: "other" });
  await old.submitTransactionPreview(preview);
  expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
});

it.each([false, true])("#433 validates its own submission without accepting a foreign pending record (%s)", async foreign => {
  const walletUnit = `${"aa".repeat(28)}01`;
  const spent = { txHash: "cd".repeat(32), outputIndex: 0 };
  const deps = makeDeps({ selectedDetectedToken: { unit: walletUnit, utxo: { input: spent } } });
  deps.jotaiStore.set(routeStateAtom, { ...deps.jotaiStore.get(routeStateAtom), selectedWalletUnit: walletUnit });
  deps.jotaiStore.set(sttInputTxHashAtom, spent.txHash);
  deps.jotaiStore.set(sttInputOutputIndexAtom, "0");
  bindPreview(deps);
  const broadcast = vi.fn();
  mocks.signAndSubmitTx.mockImplementationOnce(async (_wallet, _hex, options: {
    assertCurrent: () => Promise<void>;
    beforeBroadcast: (transaction: { txHash: string; invalidHereafter: number }) => void;
  }) => {
    await options.assertCurrent();
    options.beforeBroadcast({ txHash: TX_HASH, invalidHereafter: 123 });
    expect(deps.jotaiStore.get(pendingWalletStateUpdatesAtom)[walletUnit]?.submittedTxHash).toBe(TX_HASH);
    if (foreign) deps.jotaiStore.set(beginWalletStateUpdateAtom, {
      walletUnit, submittedTxHash: "ef".repeat(32), spentRef: spent
    });
    await options.assertCurrent();
    broadcast();
    return TX_HASH;
  });
  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
  expect(broadcast).toHaveBeenCalledTimes(foreign ? 0 : 1);
  expect(mocks.freshness).toHaveBeenCalledTimes(foreign ? 1 : 2);
});
