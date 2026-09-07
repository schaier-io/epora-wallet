import { resetAllFlowAtom } from "./atoms/transaction-flow.atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  detectedSttTokensAtom,
  permissionWalletSummariesAtom
} from "@/components/user/workspace/atoms/workspace-data.atoms";
import type * as WorkspaceHelpers from "@/components/user/workspace/helpers";
import type { DetectedSttToken } from "@/lib/mesh/detection";

const mocks = vi.hoisted(() => ({ detectSttInfo: vi.fn(), fetchScriptUtxos: vi.fn() }));

vi.mock("@/lib/mesh/detection", () => ({ detectSttInfo: mocks.detectSttInfo }));
vi.mock("@/lib/contracts/blueprint", () => ({
  getSttMintPolicyId: () => "policy",
  resolveWalletSpendAddress: ({ sttAssetNameHex }: { sttAssetNameHex: string }) =>
    `addr_test1${sttAssetNameHex}`
}));
vi.mock("@/components/user/workspace/helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceHelpers>()),
  fetchScriptUtxos: mocks.fetchScriptUtxos
}));

import { useDetectedSttTokens } from "./use-detected-stt-tokens";

const token = { unit: "policyaa", policyId: "policy", assetNameHex: "aa" } as DetectedSttToken;

function setup(selectedDetectedTokenUnit: string, enabled = false) {
  const store = createStore();
  store.set(detectedSttTokensAtom, [token]);
  const setSelectedDetectedTokenUnit = vi.fn();
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(
    ({ scanEnabled }) =>
      useDetectedSttTokens({
        enabled: scanEnabled,
        selectedDetectedTokenUnit,
        setSelectedDetectedTokenUnit
      }),
    { wrapper, initialProps: { scanEnabled: enabled } }
  );
  if (!enabled) {
    // `enabled: false` empties the list on mount; seed it again to model a loaded workspace.
    act(() => store.set(detectedSttTokensAtom, [token]));
  }
  return { store, hook, setSelectedDetectedTokenUnit };
}

beforeEach(() => {
  mocks.detectSttInfo.mockReset();
  mocks.fetchScriptUtxos.mockReset().mockResolvedValue([]);
});

it("keeps the wallet list when a post-submit re-detect fails", async () => {
  // One failed poll tick emptied the list although keepSelection asked to hold it.
  mocks.detectSttInfo.mockRejectedValue(new Error("indexer lag"));
  const { store, hook } = setup(token.unit);

  await act(async () => {
    await expect(hook.result.current.refreshDetectedTokens({ keepSelection: true })).rejects.toThrow();
  });
  expect(store.get(detectedSttTokensAtom)).toEqual([token]);
});

it("does not publish a keep-selection scan that misses the selected wallet", async () => {
  mocks.detectSttInfo.mockResolvedValue({ policyId: "policy", tokens: [] });
  const { store, hook } = setup(token.unit);

  let detected: Awaited<ReturnType<typeof hook.result.current.refreshDetectedTokens>>;
  await act(async () => {
    detected = await hook.result.current.refreshDetectedTokens({ keepSelection: true });
  });

  expect(detected!).toBeNull();
  expect(store.get(detectedSttTokensAtom)).toEqual([token]);
});

it("does not clear a selection that is already empty", async () => {
  // Each mint-confirmation poll tick re-cleared nothing and pushed a history entry.
  mocks.detectSttInfo.mockResolvedValue({ policyId: "policy", tokens: [] });
  const { hook, setSelectedDetectedTokenUnit } = setup("");

  await act(async () => {
    await hook.result.current.refreshDetectedTokens();
  });
  expect(setSelectedDetectedTokenUnit).not.toHaveBeenCalled();
});

it("ignores an older token scan that finishes after a newer scan", async () => {
  const olderToken = { unit: "policyold", policyId: "policy", assetNameHex: "old" } as DetectedSttToken;
  const newerToken = { unit: "policynew", policyId: "policy", assetNameHex: "new" } as DetectedSttToken;
  let resolveOlder!: (result: { policyId: string; tokens: DetectedSttToken[] }) => void;
  let resolveNewer!: (result: { policyId: string; tokens: DetectedSttToken[] }) => void;
  mocks.detectSttInfo
    .mockReturnValueOnce(new Promise((resolve) => (resolveOlder = resolve)))
    .mockReturnValueOnce(new Promise((resolve) => (resolveNewer = resolve)));
  const { store, hook } = setup("");

  let older!: ReturnType<typeof hook.result.current.refreshDetectedTokens>;
  let newer!: ReturnType<typeof hook.result.current.refreshDetectedTokens>;
  let invalidatedResult!: Awaited<typeof older>;
  act(() => {
    older = hook.result.current.refreshDetectedTokens();
    newer = hook.result.current.refreshDetectedTokens();
  });

  await act(async () => {
    resolveNewer({ policyId: "policy", tokens: [newerToken] });
    await newer;
  });
  await act(async () => {
    resolveOlder({ policyId: "policy", tokens: [olderToken] });
    invalidatedResult = await older;
  });

  expect(store.get(detectedSttTokensAtom)).toEqual([newerToken]);
  expect(invalidatedResult).toBeNull();
});

it("keeps a manual scan result when the mount scan finishes later", async () => {
  const effectToken = { unit: "policyeffect", policyId: "policy", assetNameHex: "effect" } as DetectedSttToken;
  const manualToken = { unit: "policymanual", policyId: "policy", assetNameHex: "manual" } as DetectedSttToken;
  let resolveEffect!: (result: { policyId: string; tokens: DetectedSttToken[] }) => void;
  let resolveManual!: (result: { policyId: string; tokens: DetectedSttToken[] }) => void;
  mocks.detectSttInfo
    .mockReturnValueOnce(new Promise((resolve) => (resolveEffect = resolve)))
    .mockReturnValueOnce(new Promise((resolve) => (resolveManual = resolve)));
  const { store, hook } = setup("", true);
  await waitFor(() => expect(mocks.detectSttInfo).toHaveBeenCalledTimes(1));

  let manual!: ReturnType<typeof hook.result.current.refreshDetectedTokens>;
  act(() => {
    manual = hook.result.current.refreshDetectedTokens();
  });
  await waitFor(() => expect(mocks.detectSttInfo).toHaveBeenCalledTimes(2));

  await act(async () => {
    resolveManual({ policyId: "policy", tokens: [manualToken] });
    await manual;
  });
  await act(async () => {
    resolveEffect({ policyId: "policy", tokens: [effectToken] });
    await Promise.resolve();
  });

  expect(store.get(detectedSttTokensAtom)).toEqual([manualToken]);
});

it("does not publish a manual scan after detection is disabled", async () => {
  const manualToken = { unit: "policymanual", policyId: "policy", assetNameHex: "manual" } as DetectedSttToken;
  let resolveManual!: (result: { policyId: string; tokens: DetectedSttToken[] }) => void;
  mocks.detectSttInfo
    .mockResolvedValueOnce({ policyId: "policy", tokens: [] })
    .mockReturnValueOnce(new Promise((resolve) => (resolveManual = resolve)));
  const { store, hook } = setup("", true);
  await waitFor(() => expect(mocks.detectSttInfo).toHaveBeenCalledTimes(1));

  let manual!: ReturnType<typeof hook.result.current.refreshDetectedTokens>;
  act(() => {
    manual = hook.result.current.refreshDetectedTokens();
  });
  await waitFor(() => expect(mocks.detectSttInfo).toHaveBeenCalledTimes(2));
  hook.rerender({ scanEnabled: false });

  await act(async () => {
    resolveManual({ policyId: "policy", tokens: [manualToken] });
    await manual;
  });

  expect(store.get(detectedSttTokensAtom)).toEqual([]);
});

it("does not publish a manual scan after the hook unmounts", async () => {
  const manualToken = { unit: "policymanual", policyId: "policy", assetNameHex: "manual" } as DetectedSttToken;
  let resolveManual!: (result: { policyId: string; tokens: DetectedSttToken[] }) => void;
  mocks.detectSttInfo
    .mockResolvedValueOnce({ policyId: "policy", tokens: [] })
    .mockReturnValueOnce(new Promise((resolve) => (resolveManual = resolve)));
  const { store, hook } = setup("", true);
  await waitFor(() => expect(mocks.detectSttInfo).toHaveBeenCalledTimes(1));

  let manual!: ReturnType<typeof hook.result.current.refreshDetectedTokens>;
  act(() => {
    manual = hook.result.current.refreshDetectedTokens();
  });
  await waitFor(() => expect(mocks.detectSttInfo).toHaveBeenCalledTimes(2));
  hook.unmount();

  await act(async () => {
    resolveManual({ policyId: "policy", tokens: [manualToken] });
    await manual;
  });

  expect(store.get(detectedSttTokensAtom)).toEqual([]);
});

it("does not let an older wallet summary overwrite a newer one", async () => {
  const olderToken = { unit: "policyold", policyId: "policy", assetNameHex: "old" } as DetectedSttToken;
  const newerToken = { unit: "policynew", policyId: "policy", assetNameHex: "new" } as DetectedSttToken;
  let resolveOlder!: (utxos: Array<{ output: { amount: [] } }>) => void;
  let resolveNewer!: (utxos: Array<{ output: { amount: [] } }>) => void;
  mocks.fetchScriptUtxos
    .mockReturnValueOnce(new Promise((resolve) => (resolveOlder = resolve)))
    .mockReturnValueOnce(new Promise((resolve) => (resolveNewer = resolve)));
  const { store, hook } = setup("");

  let older!: ReturnType<typeof hook.result.current.refreshPermissionWalletSummaries>;
  let newer!: ReturnType<typeof hook.result.current.refreshPermissionWalletSummaries>;
  act(() => {
    older = hook.result.current.refreshPermissionWalletSummaries([olderToken]);
    newer = hook.result.current.refreshPermissionWalletSummaries([newerToken]);
  });

  await act(async () => {
    resolveNewer([{ output: { amount: [] } }]);
    await newer;
  });
  await act(async () => {
    resolveOlder([{ output: { amount: [] } }]);
    await older;
  });

  expect(Object.keys(store.get(permissionWalletSummariesAtom))).toEqual([newerToken.unit]);
});

it("refreshes the known wallet by identity and preserves other cached wallets", async () => {
  const other = { ...token, unit: "policybb", assetNameHex: "bb" };
  mocks.detectSttInfo.mockResolvedValue({ policyId: "policy", tokens: [token] });
  const { store, hook } = setup(token.unit);
  act(() => store.set(detectedSttTokensAtom, [token, other]));
  let result: Awaited<ReturnType<typeof hook.result.current.refreshDetectedTokens>>;
  await act(async () => { result = await hook.result.current.refreshDetectedTokens({ keepSelection: true }); });
  expect(result!.tokens).toContainEqual(other);
  expect(mocks.detectSttInfo).toHaveBeenCalledWith(token.unit);
  expect(store.get(detectedSttTokensAtom)).toContainEqual(other);
  expect(store.get(detectedSttTokensAtom)).toContainEqual(token);
});

it("queries a newly minted wallet by unit without dropping the current wallet", async () => {
  const minted = { ...token, unit: "policycc", assetNameHex: "cc" };
  mocks.detectSttInfo.mockResolvedValue({ policyId: "policy", tokens: [minted] });
  const { store, hook, setSelectedDetectedTokenUnit } = setup(token.unit);

  await act(async () => {
    await hook.result.current.refreshDetectedTokens({ knownUnit: minted.unit });
  });

  expect(mocks.detectSttInfo).toHaveBeenCalledWith(minted.unit);
  expect(store.get(detectedSttTokensAtom)).toEqual([token, minted]);
  expect(setSelectedDetectedTokenUnit).not.toHaveBeenCalled();
});


it("manual refresh discovers other wallets even when a wallet is selected", async () => {
  const other = { ...token, unit: "policybb", assetNameHex: "bb" };
  mocks.detectSttInfo.mockResolvedValue({ policyId: "policy", tokens: [token, other] });
  const { store, hook } = setup(token.unit);
  await act(async () => { await hook.result.current.refreshDetectedTokens(); });
  expect(mocks.detectSttInfo).toHaveBeenCalledWith(undefined);
  expect(store.get(detectedSttTokensAtom)).toEqual([token, other]);
});

it("retires an in-flight token scan after unmount reset", async () => {
  const { store, hook } = setup(token.unit);
  let resolve!: (value: unknown) => void;
  mocks.detectSttInfo.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  let pending!: ReturnType<typeof hook.result.current.refreshDetectedTokens>;
  await act(async () => { pending = hook.result.current.refreshDetectedTokens(); });
  await act(async () => {
    store.set(resetAllFlowAtom);
    resolve({ policyId: "policy", tokens: [] });
    await pending;
  });
  expect(store.get(detectedSttTokensAtom)).toEqual([token]);
});

it("retires in-flight balance summaries after unmount reset", async () => {
  const { store, hook } = setup(token.unit);
  let resolve!: (value: unknown) => void;
  mocks.fetchScriptUtxos.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  let pending!: ReturnType<typeof hook.result.current.refreshPermissionWalletSummaries>;
  await act(async () => { pending = hook.result.current.refreshPermissionWalletSummaries([token]); });
  await act(async () => {
    store.set(resetAllFlowAtom);
    resolve([]);
    await pending;
  });
  expect(store.get(permissionWalletSummariesAtom)).toEqual({});
});
