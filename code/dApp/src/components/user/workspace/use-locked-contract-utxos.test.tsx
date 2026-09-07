import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { expect, it, vi } from "vitest";
import { activeAddressAtom } from "@/providers/wallet.atoms";
import { lockedContractUtxosAtom, lockedContractUtxosLoadingAtom, lockedContractUtxosErrorAtom } from "./atoms/workspace-data.atoms";
import { resetAllFlowAtom } from "./atoms/transaction-flow.atoms";

const mocks = vi.hoisted(() => ({ fetchScriptUtxos: vi.fn() }));
vi.mock("@/components/user/workspace/helpers", () => ({ fetchScriptUtxos: mocks.fetchScriptUtxos }));
import { useLockedContractUtxos } from "./use-locked-contract-utxos";

for (const transition of ["disconnect", "unmount"] as const) {
  for (const outcome of ["success", "failure"] as const) {
    it(`retires fund ${outcome} after ${transition} without another request`, async () => {
      const store = createStore();
      store.set(activeAddressAtom, "wallet-a");
      const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
      const { result } = renderHook(useLockedContractUtxos, { wrapper });
      let settle!: () => void;
      mocks.fetchScriptUtxos.mockImplementationOnce(() => new Promise((resolve, reject) => {
        settle = () => outcome === "success" ? resolve([{ input: { txHash: "old" } }]) : reject(new Error("old failure"));
      }));
      let pending!: Promise<void>;
      await act(async () => { pending = result.current.refreshLockedContractUtxos("wallet-a"); });
      await act(async () => {
        if (transition === "disconnect") store.set(activeAddressAtom, null);
        else store.set(resetAllFlowAtom);
        settle();
        await pending;
      });
      expect(store.get(lockedContractUtxosAtom)).toEqual([]);
      expect(store.get(lockedContractUtxosErrorAtom)).toBeNull();
      expect(store.get(lockedContractUtxosLoadingAtom)).toBe(false);
    });
  }
}

it("an unmounted reader cannot clear the next mount's loading state", async () => {
  const store = createStore();
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  const first = renderHook(useLockedContractUtxos, { wrapper });
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  mocks.fetchScriptUtxos
    .mockImplementationOnce(() => new Promise(resolve => { finishFirst = () => resolve([]); }))
    .mockImplementationOnce(() => new Promise(resolve => { finishSecond = () => resolve([]); }));
  let oldRead!: Promise<void>;
  await act(async () => { oldRead = first.result.current.refreshLockedContractUtxos("wallet-a"); });
  first.unmount();
  store.set(resetAllFlowAtom);
  const second = renderHook(useLockedContractUtxos, { wrapper });
  let newRead!: Promise<void>;
  await act(async () => { newRead = second.result.current.refreshLockedContractUtxos("wallet-b"); });
  await act(async () => { finishFirst(); await oldRead; });
  expect(store.get(lockedContractUtxosLoadingAtom)).toBe(true);
  await act(async () => { finishSecond(); await newRead; });
  expect(store.get(lockedContractUtxosLoadingAtom)).toBe(false);
});
