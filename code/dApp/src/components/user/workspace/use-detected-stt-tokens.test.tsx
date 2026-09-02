import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { detectedSttTokensAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import type { DetectedSttToken } from "@/lib/mesh/detection";

const mocks = vi.hoisted(() => ({ detectSttInfo: vi.fn() }));

vi.mock("@/lib/mesh/detection", () => ({ detectSttInfo: mocks.detectSttInfo }));
vi.mock("@/lib/contracts/blueprint", () => ({
  getSttMintPolicyId: () => "policy",
  resolveWalletSpendAddress: () => "addr_test1script"
}));

import { useDetectedSttTokens } from "./use-detected-stt-tokens";

const token = { unit: "policyaa", policyId: "policy", assetNameHex: "aa" } as DetectedSttToken;

function setup(selectedDetectedTokenUnit: string) {
  const store = createStore();
  store.set(detectedSttTokensAtom, [token]);
  const setSelectedDetectedTokenUnit = vi.fn();
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(
    () =>
      useDetectedSttTokens({ enabled: false, selectedDetectedTokenUnit, setSelectedDetectedTokenUnit }),
    { wrapper }
  );
  // `enabled: false` empties the list on mount; seed it again to model a loaded workspace.
  act(() => store.set(detectedSttTokensAtom, [token]));
  return { store, hook, setSelectedDetectedTokenUnit };
}

beforeEach(() => {
  mocks.detectSttInfo.mockReset();
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

it("does not clear a selection that is already empty", async () => {
  // Each mint-confirmation poll tick re-cleared nothing and pushed a history entry.
  mocks.detectSttInfo.mockResolvedValue({ policyId: "policy", tokens: [] });
  const { hook, setSelectedDetectedTokenUnit } = setup("");

  await act(async () => {
    await hook.result.current.refreshDetectedTokens();
  });
  expect(setSelectedDetectedTokenUnit).not.toHaveBeenCalled();
});
