import { createStore } from "jotai";
import { QueryObserver } from "@tanstack/react-query";
import { queryClientAtom } from "jotai-tanstack-query";
import { createAppQueryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { parseWorkspaceRouteState } from "../workspace-controller";
import { resetAllFlowAtom, resetFlowAtom } from "./atoms/transaction-flow.atoms";
import assert from "node:assert/strict";
import test from "node:test";
import { schedulePostSubmitRefresh } from "./workspace-transaction-refresh";

function fixture() {
  const callbacks: Array<() => void> = [];
  const delays: number[] = [];
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    clearTimeout() {},
    setTimeout(callback: () => void, delay: number) { callbacks.push(callback); delays.push(delay); return callbacks.length; }
  }});
  const store = createStore();
  const client = createAppQueryClient();
  client.setDefaultOptions({ queries: { retry: false, gcTime: Infinity, staleTime: Infinity } });
  store.set(queryClientAtom, client);
  return {
    callbacks, delays, store, client,
    deps: { jotaiStore: store, postSubmitRefreshTimersRef: { current: [] as number[] } },
    cleanup() {
      client.clear();
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  };
}

test("each scheduled refresh invalidates inactive chain data and private verification", () => {
  const context = fixture();
  const keys = [queryKeys.addressUtxos("wallet-a"), queryKeys.sttWallet("policy", "unit"),
    queryKeys.accountInfo("rewards"), [...queryKeys.chain, "wallet-activity", "wallet-a"],
    ["proposals", "preprod", "signer", "verification", "request"]];
  context.client.setQueryDefaults(keys[4], { meta: { chainDependent: true } });
  try {
    schedulePostSubmitRefresh(context.deps);
    assert.deepEqual(context.delays, [12_000, 30_000, 50_000, 75_000]);
    for (const callback of context.callbacks) {
      keys.forEach(key => context.client.setQueryData(key, "before"));
      callback();
      keys.forEach(key => assert.equal(context.client.getQueryState(key)?.isInvalidated, true));
    }
  } finally { context.cleanup(); }
});

test("a timer refresh shares one request between two observers", async () => {
  const context = fixture();
  const key = queryKeys.addressUtxos("wallet-a");
  context.client.setQueryData(key, "before");
  let reads = 0;
  const options = { queryKey: key, queryFn: async () => { reads += 1; return "after"; } };
  const first = new QueryObserver(context.client, options);
  const second = new QueryObserver(context.client, options);
  const unsubscribe = [first.subscribe(() => {}), second.subscribe(() => {})];
  try {
    schedulePostSubmitRefresh(context.deps);
    context.callbacks[0]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 1);
    assert.equal(first.getCurrentResult().data, "after");
    assert.equal(second.getCurrentResult().data, "after");
  } finally { unsubscribe.forEach(stop => stop()); context.cleanup(); }
});

for (const transition of ["selection", "unmount", "action navigation"] as const) {
  test(`refresh callbacks respect ${transition}`, () => {
    const context = fixture();
    const key = queryKeys.addressUtxos("wallet-a");
    context.client.setQueryData(key, "before");
    try {
      schedulePostSubmitRefresh(context.deps);
      if (transition === "selection") context.store.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("wallet=wallet-b")));
      else if (transition === "unmount") context.store.set(resetAllFlowAtom);
      else {
        context.store.set(routeStateAtom, { ...context.store.get(routeStateAtom), selectedAction: "mint" });
        context.store.set(resetFlowAtom);
      }
      context.callbacks.forEach(callback => callback());
      assert.equal(context.client.getQueryState(key)?.isInvalidated, transition === "action navigation");
    } finally { context.cleanup(); }
  });
}
