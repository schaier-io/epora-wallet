import { walletConnectionDialogOpenAtom } from "./atoms/workspace-ui.atoms";
import { createDefaultStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";
import type { DetectedSttInfo, DetectedSttToken } from "@/lib/mesh/detection";
import { createQueryTestWrapper } from "@/test/query-client";
import { activePaymentKeyHashAtom, isConnectingAtom } from "@/providers/wallet.atoms";
import { queryKeys } from "@/lib/query/keys";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { selectedDetectedTokenUnitAtom } from "./atoms/workspace-selection.atoms";
import { workspaceSessionAtom, resetAllFlowAtom } from "./atoms/transaction-flow.atoms";
import { pendingWalletStateUpdateAtom } from "./atoms/wallet-state-update.atoms";

const chain = vi.hoisted(() => ({ detectSttInfo: vi.fn(), fetchAddressUTxOs: vi.fn(), resolveAddress: vi.fn() }));
vi.mock("@/lib/mesh/detection", () => ({ detectSttInfo: chain.detectSttInfo }));
vi.mock("@/lib/mesh/server-fetcher", () => ({ ServerFetcher: class { fetchAddressUTxOs = chain.fetchAddressUTxOs; } }));
vi.mock("@/lib/contracts/blueprint", () => ({ getSttMintPolicyId: () => "policy", resolveWalletContinuingOutputAddressFromState: chain.resolveAddress }));
import { detectedSttTokensAtom, detectedSttTokensLoadingAtom, detectedSttTokensErrorAtom, sttInventoryQueryOptions } from "./queries/stt-queries.atoms";
import { permissionWalletSummariesAtom } from "./queries/summary-queries.atoms";
import { useDetectedSttTokens } from "./use-detected-stt-tokens";

const token = (name: string): DetectedSttToken => ({ unit: `policy${name}`, policyId: "policy", assetNameHex: name, scriptAddress: "state-address", datum: null,
  utxo: { input: { txHash: name, outputIndex: 0 }, output: { address: "state-address", amount: [] } } });
const info = (tokens: DetectedSttToken[]): DetectedSttInfo => ({ policyId: "policy", assetNameHex: "", scriptAddress: "state-address", sttUtxos: tokens.map(t => t.utxo), tokens });
const a = token("aa"), b = token("bb");
function setup(selectedUnit = "", cached?: DetectedSttToken[]) {
  const context = createQueryTestWrapper();
  context.store.set(isConnectingAtom, true);
  context.store.set(routeStateAtom, { ...context.store.get(routeStateAtom), selectedWalletUnit: selectedUnit || null });
  if (cached) {
    context.queryClient.setQueryData(queryKeys.sttInventory("policy"), info(cached));
    if (selectedUnit) context.queryClient.setQueryData(queryKeys.sttWallet("policy", selectedUnit), info(cached.filter(t => t.unit === selectedUnit)));
  }
  const setSelection = vi.fn((unit: string) => context.store.set(routeStateAtom, { ...context.store.get(routeStateAtom), selectedWalletUnit: unit || null }));
  const hook = renderHook(() => {
    const selectedDetectedTokenUnit = useAtomValue(selectedDetectedTokenUnitAtom);
    return { ...useDetectedSttTokens({ selectedDetectedTokenUnit, setSelectedDetectedTokenUnit: setSelection }),
      tokens: useAtomValue(detectedSttTokensAtom), loading: useAtomValue(detectedSttTokensLoadingAtom), summaries: useAtomValue(permissionWalletSummariesAtom), error: useAtomValue(detectedSttTokensErrorAtom) };
  }, { wrapper: context.wrapper });
  return { ...context, ...hook, setSelection };
}
beforeEach(() => {
  chain.detectSttInfo.mockReset().mockImplementation((unit) => Promise.resolve(info(unit ? [a].filter(t => t.unit === unit) : [a, b])));
  chain.fetchAddressUTxOs.mockReset().mockResolvedValue([]);
  chain.resolveAddress.mockReset().mockImplementation(({ sttAssetNameHex }) => `base-${sttAssetNameHex}`);
});

it("reserves State refreshes for the exact confirmation flow while a State update is pending", async () => {
  const test = setup(a.unit, [a]);
  act(() => test.store.set(pendingWalletStateUpdateAtom, { walletUnit: a.unit, submittedTxHash: "submitted", spentRef: a.utxo.input }));
  await act(async () => {
    expect(await test.result.current.refreshDetectedTokens()).toBeNull();
    await test.queryClient.invalidateQueries({ queryKey: queryKeys.chain });
  });
  expect(chain.detectSttInfo).not.toHaveBeenCalled();
  await act(async () => {
    const result = await test.result.current.refreshDetectedTokens({ knownUnit: a.unit, keepSelection: true, exactStateRefresh: true });
    expect(result?.tokens).toContainEqual(a);
  });
  expect(chain.detectSttInfo).toHaveBeenCalledWith(a.unit, expect.any(AbortSignal));
});

it("loads full inventory from a direct wallet route and keeps it on overview navigation", async () => {
  const test = setup(a.unit);
  await waitFor(() => expect(test.result.current.tokens).toHaveLength(2));
  expect(chain.detectSttInfo).toHaveBeenCalledWith(a.unit, expect.any(AbortSignal));
  expect(chain.detectSttInfo).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
  act(() => test.store.set(routeStateAtom, { ...test.store.get(routeStateAtom), selectedWalletUnit: null }));
  expect(test.result.current.tokens).toEqual([a, b]);
  expect(chain.detectSttInfo).toHaveBeenCalledTimes(2);
});
it("keeps the previous State and inventory when a detail refresh fails or misses a successor", async () => {
  const test = setup(a.unit, [a, b]);
  chain.detectSttInfo.mockRejectedValueOnce(new Error("indexer lag"));
  await act(async () => { await expect(test.result.current.refreshDetectedTokens({ keepSelection: true })).rejects.toThrow("indexer lag"); });
  expect(test.result.current.tokens).toEqual([b, a]);
  chain.detectSttInfo.mockResolvedValueOnce(info([]));
  await act(async () => { await expect(test.result.current.refreshDetectedTokens({ keepSelection: true })).rejects.toThrow("State token not indexed yet"); });
  expect(test.result.current.tokens).toContainEqual(a);
  expect(test.setSelection).not.toHaveBeenCalled();
});
it("manual refresh discovers other wallets while a wallet is selected", async () => {
  const test = setup(a.unit, [a]);
  await act(async () => { await test.result.current.refreshDetectedTokens(); });
  await waitFor(() => expect(test.result.current.tokens).toEqual([a, b]));
  expect(chain.detectSttInfo).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
});
it("deduplicates concurrent inventory reads", async () => {
  const { queryClient } = createQueryTestWrapper();
  await Promise.all([queryClient.fetchQuery(sttInventoryQueryOptions("policy")), queryClient.fetchQuery(sttInventoryQueryOptions("policy"))]);
  expect(chain.detectSttInfo).toHaveBeenCalledTimes(1);
});
it("preserves current wallets when querying a newly minted wallet by unit", async () => {
  const test = setup(a.unit, [a]);
  chain.detectSttInfo.mockResolvedValueOnce(info([b]));
  let result: DetectedSttInfo | null = null;
  await act(async () => { result = await test.result.current.refreshDetectedTokens({ knownUnit: b.unit }); });
  expect(result).toMatchObject({ tokens: [a, b] });
  expect(test.result.current.tokens).toContainEqual(a);
  expect(test.queryClient.getQueryData(queryKeys.sttWallet("policy", b.unit))).toEqual(info([b]));
  expect(test.setSelection).not.toHaveBeenCalled();
});
it("hides cached inventory after disconnect and prevents stale session form updates", async () => {
  const test = setup(a.unit, [a]);
  let finish!: (data: DetectedSttInfo) => void;
  chain.detectSttInfo.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let pending!: ReturnType<typeof test.result.current.refreshDetectedTokens>;
  await act(async () => { pending = test.result.current.refreshDetectedTokens(); });
  const before = test.store.get(workspaceSessionAtom);
  act(() => { test.store.set(resetAllFlowAtom); test.store.set(isConnectingAtom, false); });
  expect(test.store.get(workspaceSessionAtom)).not.toBe(before);
  await act(async () => { finish(info([])); await pending; });
  expect(test.result.current.tokens).toEqual([]);
  expect(test.setSelection).not.toHaveBeenCalled();
});
it("does not clear an already empty route selection during refresh", async () => {
  const test = setup("", []);
  chain.detectSttInfo.mockResolvedValueOnce(info([]));
  await act(async () => { await test.result.current.refreshDetectedTokens(); });
  expect(test.setSelection).not.toHaveBeenCalled();
});
it("uses datum-derived canonical addresses and shares duplicate address requests", async () => {
  chain.resolveAddress.mockReturnValue("base-with-stake");
  chain.fetchAddressUTxOs.mockResolvedValue([{ input: { txHash: "funds", outputIndex: 0 }, output: { address: "base-with-stake", amount: [{ unit: "lovelace", quantity: "7000000" }] } }]);
  const test = setup("", [a, b]);
  await waitFor(() => expect(test.result.current.summaries[a.unit]?.lockedUtxoCount).toBe(1));
  expect(test.result.current.summaries[b.unit]).toMatchObject({ address: "base-with-stake", lockedAssets: [{ unit: "lovelace", quantity: "7000000" }] });
  expect(chain.resolveAddress).toHaveBeenCalledWith({ sttPolicyId: a.policyId, sttAssetNameHex: a.assetNameHex, stateDatum: a.datum });
  expect(chain.fetchAddressUTxOs).toHaveBeenCalledTimes(1);
  expect(test.queryClient.getQueryData(queryKeys.addressUtxos("base-with-stake"))).toHaveLength(1);
});
it("retains cached funds after summary failure and manual refresh recovers", async () => {
  const test = setup("", [a]);
  await waitFor(() => expect(test.result.current.summaries[a.unit]).toBeDefined());
  await waitFor(() => expect(chain.fetchAddressUTxOs).toHaveBeenCalledTimes(1));
  chain.fetchAddressUTxOs.mockRejectedValueOnce(new Error("offline"));
  await act(async () => { await test.result.current.refreshPermissionWalletSummaries(); });
  await waitFor(() => expect(test.result.current.summaries[a.unit].error).not.toBeNull());
  await act(async () => { await test.result.current.refreshPermissionWalletSummaries(); });
  await waitFor(() => expect(test.result.current.summaries[a.unit].error).toBeNull());
});
it("does not request inactive wallet balances until the wallet selector opens", async () => {
  const test = setup(a.unit, [a, b]);
  expect(chain.fetchAddressUTxOs).not.toHaveBeenCalled();
  act(() => test.store.set(walletConnectionDialogOpenAtom, true));
  await waitFor(() => expect(chain.fetchAddressUTxOs).toHaveBeenCalledWith("base-bb"));
});
it("filters summary reads by the signer's roles before requesting balances", async () => {
  const context = createQueryTestWrapper();
  const signer = "ab".repeat(28);
  const state = createDefaultStateForm();
  state.users = [{ id: "1", wallets: [signer], perDayAllowance: [], remainingAllowance: [], nextAllowanceReset: "0", canRenewProofOfLife: false, multiSigPowerMode: "none", multiSigPower: "", isAdmin: true, preset: "admin" }];
  const owned = { ...a, datum: stateFormToDatum(state) };
  context.store.set(activePaymentKeyHashAtom, signer);
  context.store.set(isConnectingAtom, true);
  context.queryClient.setQueryData(queryKeys.sttInventory("policy"), info([owned, b]));
  renderHook(() => useAtomValue(permissionWalletSummariesAtom), { wrapper: context.wrapper });
  await waitFor(() => expect(chain.fetchAddressUTxOs).toHaveBeenCalledWith("base-aa"));
  expect(chain.fetchAddressUTxOs).not.toHaveBeenCalledWith("base-bb");
  act(() => {
    context.store.set(routeStateAtom, { ...context.store.get(routeStateAtom), selectedWalletUnit: b.unit });
    context.store.set(walletConnectionDialogOpenAtom, true);
  });
  await waitFor(() => expect(chain.fetchAddressUTxOs).toHaveBeenCalledWith("base-bb"));
});
it("keeps an uncached selected wallet loading when a fresh inventory has no matching token", async () => {
  const test = setup("", []);
  chain.detectSttInfo.mockImplementation(() => new Promise(() => {}));
  act(() => test.store.set(routeStateAtom, { ...test.store.get(routeStateAtom), selectedWalletUnit: a.unit }));
  expect(test.result.current.tokens).toEqual([]);
  expect(test.result.current.loading).toBe(true);
});
