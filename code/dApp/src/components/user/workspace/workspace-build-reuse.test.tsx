import { createStore } from "jotai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDefaultStateForm } from "@/lib/contracts/state-form";
import type { BuildResult } from "@/lib/types/contracts";
import { createWorkspaceFlowHandlers, type WorkspaceFlowHandlersCtx } from "./workspace-flow-handlers";
import { createWorkspaceTransactions } from "./workspace-transactions";
import type { WorkspaceTransactionsCtx } from "./workspace-transactions-types";
import { activeBuildAtom, buildErrorAtom, buildErrorExpectedAtom, lastActionLabelAtom, mintConfirmationAtom, previewAtom, previewSignatureAtom, resetAllFlowAtom, submitHashAtom } from "./atoms/transaction-flow.atoms";
import { lockFundsAssetsAtom } from "./atoms/forms/lock-funds-form.atoms";
import { activeAddressAtom } from "@/providers/wallet.atoms";
import { configAtom } from "./atoms/workspace-config.atoms";

const mocks = vi.hoisted(() => ({ build: vi.fn(), buildStt: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/mesh/transactions", () => ({
  buildLockFundsTx: mocks.build, buildSttSpendTx: mocks.buildStt, signAndSubmitTx: mocks.sign,
  getValidityWindow: () => ({ earliestTimeMs: 1750000000000, latestTimeMs: 1750000240000 })
}));
vi.mock("./workspace-transaction-refresh", () => ({ schedulePostSubmitRefresh: vi.fn() }));

// Empty unsigned transaction with an explicit future TTL. No ledger submission occurs.
const result: BuildResult = {
  txHex: "84a4008001800200031affffffffa0f5f6",
  preview: { action: "lock-funds", summary: "Deposit", cbor: "84a4008001800200031affffffffa0f5f6" }
};
const stores: ReturnType<typeof createStore>[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  mocks.build.mockReset();
  mocks.buildStt.mockReset();
  // Keep signing pending so duplicate submit continuations meet the real re-entry guard.
  mocks.sign.mockReset().mockImplementation(() => new Promise(() => {}));
});
afterEach(() => {
  stores.splice(0).forEach(store => store.set(resetAllFlowAtom));
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture() {
  const store = createStore();
  stores.push(store);
  const base = {
    jotaiStore: store,
    activeWallet: { getUtxos: vi.fn(), getChangeAddress: vi.fn(), getUsedAddresses: vi.fn(), getUnusedAddresses: vi.fn() },
    activeWalletName: "lace", networkId: 0, isDemoWallet: false,
    activePaymentKeyHash: null, activeInferredSttStateForm: createDefaultStateForm(),
    effectiveWalletAssetNameHex: "01",
    activeFieldErrors: {}, activeReadinessIssues: [], activeSubmit: false,
    selectedAction: "lock-funds", lockingContract: { address: "addr_test1lock" },
    proposalCaptureRef: { current: null }, submitInFlightRef: { current: null },
    buildActionSignature: () => JSON.stringify(store.get(lockFundsAssetsAtom)),
    setActiveBuild: (value: string | null) => store.set(activeBuildAtom, value),
    setBuildError: (value: string | null) => store.set(buildErrorAtom, value),
    setBuildErrorExpected: (value: boolean) => store.set(buildErrorExpectedAtom, value),
    setLastActionLabel: (value: string) => store.set(lastActionLabelAtom, value),
    setPreview: (value: BuildResult | null) => store.set(previewAtom, value),
    setPreviewSignature: (value: string | null) => store.set(previewSignatureAtom, value),
    setSubmitHash: (value: string | null) => store.set(submitHashAtom, value),
    setMintConfirmation: (value: null) => store.set(mintConfirmationAtom, value),
    setActiveSubmit: vi.fn(), setMintedWalletName: vi.fn(),
    addSubmittedTransactionToActivity: vi.fn(), rememberRecipients: vi.fn(),
    refreshLockedContractUtxos: vi.fn(), refreshPermissionWalletSummaries: vi.fn(),
    refreshWalletBalance: vi.fn(), watchMintCreationConfirmation: vi.fn()
  };
  const render = () => createWorkspaceTransactions({
    ...base,
    activeBuild: store.get(activeBuildAtom),
    preview: store.get(previewAtom),
    previewMatchesSelectedAction: true,
    submitHash: store.get(submitHashAtom),
    withBuildGuard: createWorkspaceFlowHandlers(base as unknown as WorkspaceFlowHandlersCtx).withBuildGuard
  } as unknown as WorkspaceTransactionsCtx);
  return { store, render, base };
}

it("shares an unfinished prebuild across renders without restarting it", async () => {
  const { render } = fixture();
  let finish!: (value: BuildResult) => void;
  mocks.build.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = render().buildSelectedActionTx();
  const second = render().buildSelectedActionTx();
  expect(mocks.build).toHaveBeenCalledTimes(1);
  finish(result);
  expect(await first).toBe(result);
  expect(await second).toBe(result);
});

it("submit waits for the pending prebuild and signs its exact CBOR once", async () => {
  const { render } = fixture();
  let finish!: (value: BuildResult) => void;
  mocks.build.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const prebuild = render().buildSelectedActionTx();
  void render().buildAndSubmitSelectedActionTx();
  void render().buildAndSubmitSelectedActionTx();
  expect(mocks.sign).not.toHaveBeenCalled();
  finish(result);
  await prebuild;
  await vi.waitFor(() => expect(mocks.sign).toHaveBeenCalledTimes(1));
  expect(mocks.sign.mock.calls[0]?.[1]).toBe(result.txHex);
  expect(mocks.build).toHaveBeenCalledTimes(1);
});

it("submit reuses the completed prebuild", async () => {
  const { render } = fixture();
  mocks.build.mockResolvedValue(result);
  await render().buildSelectedActionTx();
  void render().buildAndSubmitSelectedActionTx();
  await vi.waitFor(() => expect(mocks.sign).toHaveBeenCalledTimes(1));
  expect(mocks.sign.mock.calls[0]?.[1]).toBe(result.txHex);
  expect(mocks.build).toHaveBeenCalledTimes(1);
});

it("an input edit aborts the provider and settles the pending prebuild without a late preview", async () => {
  const { store, render } = fixture();
  let finish!: (value: BuildResult) => void;
  mocks.build.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = render().buildSelectedActionTx();
  const fetcher = mocks.build.mock.calls[0]?.[3] as { signal?: AbortSignal } | undefined;
  store.set(lockFundsAssetsAtom, [{ unit: "lovelace", quantity: "5000000" }]);
  expect(fetcher?.signal?.aborted).toBe(true);
  expect(await pending).toBeNull();
  finish(result);
  await Promise.resolve();
  expect(store.get(previewAtom)).toBeNull();
});

it("an old render cannot start a build after the connected wallet session changes", async () => {
  const { store, render } = fixture();
  const oldRender = render();
  store.set(activeAddressAtom, "addr_test1another");
  expect(await oldRender.buildSelectedActionTx()).toBeNull();
  expect(mocks.build).not.toHaveBeenCalled();
});

it("an old render cannot start a build after its inputs change", async () => {
  const { store, render } = fixture();
  const oldRender = render();
  store.set(lockFundsAssetsAtom, [{ unit: "lovelace", quantity: "7000000" }]);
  expect(await oldRender.buildSelectedActionTx()).toBeNull();
  expect(mocks.build).not.toHaveBeenCalled();
});

it("a transaction that expires on the review screen cannot be signed", async () => {
  const { render } = fixture();
  const expired = { ...result, txHex: "84a40080018002000301a0f5f6" };
  await render().submitTransactionPreview(expired, { requireCurrentPreview: false });
  expect(mocks.sign).not.toHaveBeenCalled();
});

it("expiry while a warning confirmation is open prevents signing", async () => {
  const { render } = fixture();
  vi.spyOn(window, "confirm").mockImplementation(() => {
    vi.setSystemTime(new Date("2200-01-01"));
    return true;
  });
  await render().submitTransactionPreview({ ...result, warnings: ["Review omitted funds."] }, { requireCurrentPreview: false });
  expect(mocks.sign).not.toHaveBeenCalled();
});

it("a pending direct build is canceled when the requested signing authority changes", async () => {
  const { render } = fixture();
  let finish!: (value: BuildResult) => void;
  mocks.buildStt.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = render().buildSttTx("use", "admin");
  const oldFetcher = mocks.buildStt.mock.calls[0]?.[4] as { signal: AbortSignal };
  mocks.buildStt.mockResolvedValue(result);
  const second = render().buildSttTx("use", "multisig");
  expect(oldFetcher.signal.aborted).toBe(true);
  expect(await first).toBeNull();
  expect(await second).toBe(result);
  finish(result);
  expect(mocks.buildStt).toHaveBeenCalledTimes(2);
  expect(mocks.buildStt.mock.calls[1]?.[3]).toEqual(expect.objectContaining({ authorityPath: "multisig" }));
});

it("reusing the completed multisig build retains its proposal capture", async () => {
  const { store, render, base } = fixture();
  store.set(configAtom, { ...store.get(configAtom), walletPolicyId: "aa".repeat(28) });
  mocks.buildStt.mockResolvedValue(result);
  await render().buildSttTx("use", "multisig");
  const capture = base.proposalCaptureRef.current;
  expect(capture).toEqual(expect.objectContaining({ authorityPath: "multisig" }));
  expect(await render().buildSttTx("use", "multisig")).toBe(result);
  expect(mocks.buildStt).toHaveBeenCalledTimes(1);
  expect(base.proposalCaptureRef.current).toBe(capture);
});
