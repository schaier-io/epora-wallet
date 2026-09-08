import { act, renderHook, waitFor } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createQueryTestWrapper } from "@/test/query-client";
import { activeAddressAtom, isConnectingAtom } from "@/providers/wallet.atoms";
import { queryKeys } from "@/lib/query/keys";
import { configAtom } from "./atoms/workspace-config.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { selectedDetectedTokenUnitAtom } from "./atoms/workspace-selection.atoms";
import type { DetectedSttToken } from "@/lib/mesh/detection";

const chain = vi.hoisted(() => ({ detect: vi.fn(), funds: vi.fn() }));
vi.mock("@/lib/mesh/detection", () => ({ detectSttInfo: chain.detect }));
vi.mock("@/lib/mesh/server-fetcher", () => ({ ServerFetcher: class { fetchAddressUTxOs = chain.funds; } }));
vi.mock("@/lib/contracts/blueprint", () => ({
  getSttMintPolicyId: () => "policy",
  resolveWalletContinuingOutputAddress: ({ sttAssetNameHex }: { sttAssetNameHex: string }) => `canonical-${sttAssetNameHex}`,
  resolveWalletContinuingOutputAddressFromState: ({ sttAssetNameHex }: { sttAssetNameHex: string }) => `canonical-${sttAssetNameHex}`
}));

import { useDetectedSttTokens } from "./use-detected-stt-tokens";
import { useLockedContractUtxos } from "./use-locked-contract-utxos";
import { lockingContractAtom } from "./queries/wallet-identity.atoms";
import { permissionWalletSummariesAtom } from "./queries/summary-queries.atoms";
import { lockedContractUtxosAtom } from "./queries/locked-utxos.atoms";
import { refreshWorkspaceSummary } from "./workspace-funds-refresh";

const clients: ReturnType<typeof createQueryTestWrapper>["queryClient"][] = [];
afterEach(() => clients.splice(0).forEach(client => client.clear()));
beforeEach(() => { chain.funds.mockReset().mockResolvedValue([]); });
const token = (assetNameHex: string): DetectedSttToken => ({ unit: `policy${assetNameHex}`, policyId: "policy", assetNameHex, datum: null,
  scriptAddress: "state", utxo: { input: { txHash: "state", outputIndex: 0 }, output: { address: "state", amount: [] } } });
const funds = [{ input: { txHash: "funds", outputIndex: 0 }, output: { address: "canonical-aa", amount: [{ unit: "lovelace", quantity: "5000000" }] } }];

function setup(tokens = [token("aa")]) {
  const test = createQueryTestWrapper(); clients.push(test.queryClient);
  test.store.set(isConnectingAtom, true);
  test.store.set(configAtom, { ...test.store.get(configAtom), walletPolicyId: "policy", walletAssetNameHex: "aa" });
  test.store.set(routeStateAtom, { ...test.store.get(routeStateAtom), selectedWalletUnit: "policyaa" });
  test.queryClient.setQueryData(queryKeys.sttInventory("policy"), { policyId: "policy", tokens });
  tokens.forEach(token => test.queryClient.setQueryData(queryKeys.sttWallet("policy", token.unit), { policyId: "policy", tokens: [token] }));
  test.queryClient.setQueryData(queryKeys.addressUtxos("canonical-aa"), []);
  const hook = renderHook(() => {
    const selectedDetectedTokenUnit = useAtomValue(selectedDetectedTokenUnitAtom);
    return {
      ...useDetectedSttTokens({ selectedDetectedTokenUnit, setSelectedDetectedTokenUnit: vi.fn() }),
      ...useLockedContractUtxos(),
      address: useAtomValue(lockingContractAtom).address,
      funds: useAtomValue(lockedContractUtxosAtom),
      summaries: useAtomValue(permissionWalletSummariesAtom)
    };
  }, { wrapper: test.wrapper });
  const refreshWalletTransactions = vi.fn().mockResolvedValue(undefined);
  const refresh = (includeActivity = false) => refreshWorkspaceSummary({
    ...hook.result.current, jotaiStore: test.store, walletAddress: hook.result.current.address, refreshWalletTransactions
  }, includeActivity);
  return { ...test, ...hook, refresh, refreshWalletTransactions };
}

it("uses the selected token's address before the previous config is reseeded", () => {
  const test = setup([token("aa"), token("bb")]);
  test.queryClient.setQueryData(queryKeys.addressUtxos("canonical-bb"), []);
  act(() => test.store.set(routeStateAtom, { ...test.store.get(routeStateAtom), selectedWalletUnit: "policybb" }));
  expect(test.result.current.address).toBe("canonical-bb");
  expect(test.result.current.summaries.policybb.address).toBe("canonical-bb");
  expect(test.store.get(configAtom).walletAssetNameHex).toBe("aa");
});

it("refreshes selected funds and picker totals from one canonical address read", async () => {
  const test = setup();
  chain.funds.mockResolvedValue(funds);
  await act(async () => test.refresh(true));
  expect(chain.funds).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(test.result.current.funds).toEqual(funds));
  await waitFor(() => expect(test.result.current.summaries.policyaa.lockedAssets).toEqual([{ unit: "lovelace", quantity: "5000000" }]));
  expect(test.refreshWalletTransactions).toHaveBeenCalledTimes(1);
});

it("does not refresh activity after the account changes during a funds read", async () => {
  const test = setup();
  let finish!: (value: typeof funds) => void;
  chain.funds.mockResolvedValue(funds).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = test.refresh(true); });
  act(() => test.store.set(activeAddressAtom, "next-account"));
  await act(async () => { finish(funds); await pending; });
  expect(test.refreshWalletTransactions).not.toHaveBeenCalled();
});
