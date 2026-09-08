import { useMemo } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DetectedSttInfo, DetectedSttToken } from "@/lib/mesh/detection";
import { createQueryTestWrapper } from "@/test/query-client";
import { queryKeys } from "@/lib/query/keys";
import { activeWalletAtom, activePaymentKeyHashAtom, networkIdAtom } from "@/providers/wallet.atoms";
import { createDefaultStateForm, stateFormToDatum, withFallbackAdminUserInStateForm } from "@/lib/contracts/state-form";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { useWorkspaceFoundation } from "./use-workspace-foundation";
import { useWorkspaceWalletSessionEffects } from "./use-workspace-wallet-session-effects";
import { useWorkspaceWizardEffects } from "./use-workspace-wizard-effects";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { detectedSttTokensAtom, detectedSttTokensLoadingAtom } from "./atoms/workspace-data.atoms";
import { configAtom } from "./atoms/workspace-config.atoms";
import { selectedDetectedTokenAtom, selectableWizardActionKindsAtom } from "./atoms/workspace-detected-token.atoms";

const mocks = vi.hoisted(() => ({
  search: "",
  detect: vi.fn<(unit?: string, signal?: AbortSignal) => Promise<DetectedSttInfo>>(),
  funds: vi.fn(),
  wallet: { getUtxos: async () => [] },
  reset: vi.fn(),
  refresh: vi.fn()
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/user",
  useSearchParams: () => {
    const search = mocks.search;
    return useMemo(() => new URLSearchParams(search), [search]);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}));
vi.mock("@/lib/mesh/detection", () => ({
  detectSttInfo: mocks.detect,
  detectSharedSttReferenceStore: async () => ({ status: "missing" })
}));
vi.mock("@/lib/mesh/server-fetcher", () => ({
  ServerFetcher: class { fetchAddressUTxOs = mocks.funds; }
}));
vi.mock("@/lib/contracts/blueprint", () => ({
  getSttMintPolicyId: () => "aa".repeat(28),
  resolveWalletSpendAddress: () => "addr_test1wallet",
  resolveWalletContinuingOutputAddress: () => "addr_test1wallet",
  resolveWalletContinuingOutputAddressFromState: () => "addr_test1wallet"
}));
vi.mock("@/providers/wallet-provider", () => ({
  useWalletContext: () => ({
    activeWallet: mocks.wallet,
    activeAddress: "addr_test1signer",
    activeWalletName: "test",
    activePaymentKeyHash: "cc".repeat(28),
    isDemoWallet: false,
    isConnecting: false,
    networkId: 0
  })
}));
vi.mock("@/providers/toast-provider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/user/workspace/use-shared-stt-reference", () => ({
  useSharedSttReference: () => ({ refreshSharedSttReferenceStore: mocks.refresh, resetSharedReferencePreview: mocks.reset })
}));

const POLICY = "aa".repeat(28);
const SIGNER = "cc".repeat(28);
function token(assetNameHex: string): DetectedSttToken {
  return {
    policyId: POLICY,
    assetNameHex,
    unit: POLICY + assetNameHex,
    scriptAddress: "addr_test1state",
    datum: stateFormToDatum(withFallbackAdminUserInStateForm(createDefaultStateForm(), SIGNER)),
    utxo: {
      input: { txHash: assetNameHex.repeat(32), outputIndex: 0 },
      output: { address: "addr_test1state", amount: [] }
    }
  };
}
function info(tokens: DetectedSttToken[]): DetectedSttInfo {
  return { policyId: POLICY, assetNameHex: "", scriptAddress: "addr_test1state", sttUtxos: tokens.map(t => t.utxo), tokens };
}
const firstToken = token("01");
const secondToken = token("02");
type TestContext = ReturnType<typeof createQueryTestWrapper>;
const contexts: TestContext[] = [];

function setup() {
  const context = createQueryTestWrapper();
  contexts.push(context);
  context.store.set(activeWalletAtom, mocks.wallet as never);
  context.store.set(networkIdAtom, 0);
  context.store.set(activePaymentKeyHashAtom, SIGNER);
  mocks.search = `wallet=${firstToken.unit}&step=overview`;
  context.store.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams(mocks.search)));
  context.queryClient.setQueryData(queryKeys.sttInventory(POLICY), info([firstToken]));
  context.queryClient.setQueryData(queryKeys.sttWallet(POLICY, firstToken.unit), info([firstToken]));
  return context;
}
function mount(context: TestContext) {
  return renderHook(() => {
    const foundation = useWorkspaceFoundation();
    const selected = useAtomValue(selectedDetectedTokenAtom);
    const actions = useAtomValue(selectableWizardActionKindsAtom);
    useWorkspaceWalletSessionEffects({ ...foundation, defaultDetectedWalletUnit: firstToken.unit, knownPermissionWalletCount: 1 });
    useWorkspaceWizardEffects({ ...foundation, selectedDetectedToken: selected, selectableWizardActionKinds: actions });
    return foundation;
  }, { wrapper: context.wrapper });
}
function trackRouteWrites() {
  const writes: ReturnType<typeof parseWorkspaceRouteState>[] = [];
  for (const method of ["pushState", "replaceState"] as const) {
    vi.spyOn(window.history, method).mockImplementation((_data, _unused, url) => {
      writes.push(parseWorkspaceRouteState(new URL(String(url), "http://localhost").searchParams));
    });
  }
  return writes;
}
function expectSecondWalletRoute(context: TestContext, writes: ReturnType<typeof trackRouteWrites>) {
  const expected = {
    selectedWalletUnit: secondToken.unit,
    selectedAction: "update-state",
    selectedTask: "settings-wallet-name",
    flowStep: "configure"
  };
  expect(context.store.get(routeStateAtom)).toMatchObject(expected);
  for (const written of writes) expect(written).toMatchObject(expected);
}
function deferSecondWallet() {
  let finish!: (value: DetectedSttInfo) => void;
  const pending = new Promise<DetectedSttInfo>(resolve => { finish = resolve; });
  mocks.detect.mockImplementation((unit) => unit === secondToken.unit ? pending : Promise.resolve(info([firstToken])));
  return () => finish(info([secondToken]));
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.detect.mockReset();
  mocks.funds.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  for (const context of contexts.splice(0)) context.queryClient.clear();
});

// Automatic route changes must use the current URL and wait for its selected wallet data.
for (const cached of [false, true]) {
  it(`preserves the new wallet URL on remount with ${cached ? "cached" : "pending"} selected data`, async () => {
    const context = setup();
    const first = mount(context);
    await waitFor(() => expect(context.store.get(configAtom).walletAssetNameHex).toBe("01"));
    first.unmount();
    if (cached) {
      context.queryClient.setQueryData(queryKeys.sttInventory(POLICY), info([firstToken, secondToken]));
      context.queryClient.setQueryData(queryKeys.sttWallet(POLICY, secondToken.unit), info([secondToken]));
    }
    const finish = deferSecondWallet();
    const writes = trackRouteWrites();
    mocks.search = `wallet=${secondToken.unit}&action=update-state&task=settings-wallet-name&step=configure`;
    mount(context);

    if (!cached) {
      await waitFor(() => expect(mocks.detect).toHaveBeenCalledWith(secondToken.unit, expect.any(AbortSignal)));
      expect(context.store.get(detectedSttTokensLoadingAtom)).toBe(true);
      expectSecondWalletRoute(context, writes);
      await act(async () => { finish(); });
    }
    await waitFor(() => expect(context.store.get(configAtom).walletAssetNameHex).toBe("02"));
    expectSecondWalletRoute(context, writes);
    // Jotai can cancel its optimistic observer read before mounting the lasting observer.
    const reads = cached ? mocks.detect.mock.calls : mocks.detect.mock.calls.filter(([, signal]) => !signal?.aborted);
    expect(reads.map(([unit]) => unit)).toEqual(cached ? [] : [secondToken.unit]);
  });
}

it("keeps the requested action during a mounted wallet change and reuses data for step changes", async () => {
  const context = setup();
  const view = mount(context);
  await waitFor(() => expect(context.store.get(configAtom).walletAssetNameHex).toBe("01"));
  const writes = trackRouteWrites();
  const finish = deferSecondWallet();
  mocks.search = `wallet=${secondToken.unit}&action=update-state&task=settings-wallet-name&step=configure`;
  view.rerender();

  await waitFor(() => expect(mocks.detect).toHaveBeenCalledWith(secondToken.unit, expect.any(AbortSignal)));
  expect(context.store.get(detectedSttTokensLoadingAtom)).toBe(true);
  expectSecondWalletRoute(context, writes);
  await act(async () => { finish(); });
  await waitFor(() => expect(context.store.get(configAtom).walletAssetNameHex).toBe("02"));
  expect(context.store.get(detectedSttTokensAtom)).toEqual([firstToken, secondToken]);
  expectSecondWalletRoute(context, writes);
  const readsBeforeStepChange = mocks.detect.mock.calls.length;
  expect(mocks.detect.mock.calls.map(([unit]) => unit)).toEqual(Array(readsBeforeStepChange).fill(secondToken.unit));

  mocks.search = `wallet=${secondToken.unit}&action=update-state&task=settings-wallet-name&step=review`;
  view.rerender();
  expect(context.store.get(routeStateAtom).flowStep).toBe("review");
  expect(context.store.get(configAtom).walletAssetNameHex).toBe("02");
  expect(mocks.detect).toHaveBeenCalledTimes(readsBeforeStepChange);
});
