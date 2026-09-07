import { createStore } from "jotai";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { parseWorkspaceRouteState } from "../workspace-controller";
import { resetAllFlowAtom, resetFlowAtom } from "./atoms/transaction-flow.atoms";
import assert from "node:assert/strict";
import test from "node:test";
import { schedulePostSubmitRefresh } from "./workspace-transaction-refresh";
import { beginWalletStateUpdateAtom } from "./atoms/wallet-state-update.atoms";

test("settles every timer refresh batch before discarding its result", async () => {
  const callbacks: Array<() => void> = [];
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalAllSettled = Object.getOwnPropertyDescriptor(Promise, "allSettled")!;
  const settle = Promise.allSettled.bind(Promise);
  let allSettledCalls = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      clearTimeout: () => undefined,
      setTimeout: (callback: () => void) => {
        callbacks.push(callback);
        return callbacks.length;
      }
    }
  });
  Object.defineProperty(Promise, "allSettled", {
    configurable: true,
    value: (values: Iterable<unknown>) => {
      allSettledCalls += 1;
      return settle(values);
    }
  });

  const refresh = async () => undefined;
  const deps = {
    postSubmitRefreshTimersRef: { current: [] },
    jotaiStore: createStore(),
    refreshLockedContractUtxos: refresh,
    refreshWalletBalance: refresh,
    refreshPermissionWalletSummaries: refresh,
    refreshDetectedTokens: refresh,
    lockingContract: { address: "addr_test1lock" }
  } as unknown as Parameters<typeof schedulePostSubmitRefresh>[0];

  try {
    schedulePostSubmitRefresh(deps);
    callbacks.forEach((callback) => callback());
    await Promise.resolve();
    assert.equal(allSettledCalls, 4);
  } finally {
    Object.defineProperty(Promise, "allSettled", originalAllSettled);
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("refreshes summaries from the token scan that triggered them", async () => {
  const callbacks: Array<() => void> = [];
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      clearTimeout: () => undefined,
      setTimeout: (callback: () => void) => {
        callbacks.push(callback);
        return callbacks.length;
      }
    }
  });

  const tokens = [{ unit: "new-wallet" }];
  let resolveDetected!: (value: { tokens: typeof tokens }) => void;
  const summaryInputs: unknown[] = [];
  const refresh = async () => undefined;
  const deps = {
    postSubmitRefreshTimersRef: { current: [] },
    jotaiStore: createStore(),
    refreshLockedContractUtxos: refresh,
    refreshWalletBalance: refresh,
    refreshPermissionWalletSummaries: async (nextTokens: unknown) => {
      summaryInputs.push(nextTokens);
    },
    refreshDetectedTokens: () =>
      new Promise<{ tokens: typeof tokens }>((resolve) => {
        resolveDetected = resolve;
      }),
    lockingContract: { address: "addr_test1lock" }
  } as unknown as Parameters<typeof schedulePostSubmitRefresh>[0];

  try {
    schedulePostSubmitRefresh(deps);
    callbacks[0]?.();
    await Promise.resolve();
    assert.deepEqual(summaryInputs, []);

    resolveDetected({ tokens });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(summaryInputs, [tokens]);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("scheduled refreshes do not start a generic State scan while an exact refresh is pending", async () => {
  const callbacks: Array<() => void> = [];
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      clearTimeout: () => undefined,
      setTimeout: (callback: () => void) => {
        callbacks.push(callback);
        return callbacks.length;
      }
    }
  });
  const store = createStore();
  store.set(beginWalletStateUpdateAtom, {
    walletUnit: "policy01",
    submittedTxHash: "ab".repeat(32),
    spentRef: { txHash: "cd".repeat(32), outputIndex: 0 }
  });
  const refreshDetectedTokens = async () => {
    assert.fail("generic State scan must stay idle");
  };
  let otherRefreshes = 0;
  const refresh = async () => {
    otherRefreshes += 1;
  };
  const deps = {
    postSubmitRefreshTimersRef: { current: [] },
    jotaiStore: store,
    refreshLockedContractUtxos: refresh,
    refreshWalletBalance: refresh,
    refreshPermissionWalletSummaries: refresh,
    refreshDetectedTokens,
    lockingContract: { address: "addr_test1lock" }
  } as unknown as Parameters<typeof schedulePostSubmitRefresh>[0];

  try {
    schedulePostSubmitRefresh(deps);
    callbacks[0]?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(otherRefreshes, 2);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

for (const transition of ["selection", "unmount", "action navigation"] as const) {
  test(`refresh callbacks respect ${transition}`, async () => {
    const callbacks: Array<() => void> = [];
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      clearTimeout() {}, setTimeout(callback: () => void) { callbacks.push(callback); return callbacks.length; }
    }});
    const store = createStore();
    let calls = 0;
    const refresh = async () => { calls += 1; };
    const deps = { jotaiStore: store, postSubmitRefreshTimersRef: { current: [] },
      lockingContract: { address: "wallet-a" }, refreshLockedContractUtxos: refresh,
      refreshWalletBalance: refresh, refreshPermissionWalletSummaries: refresh,
      refreshDetectedTokens: refresh } as unknown as Parameters<typeof schedulePostSubmitRefresh>[0];
    try {
      schedulePostSubmitRefresh(deps);
      if (transition === "selection") store.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("wallet=wallet-b")));
      else if (transition === "unmount") store.set(resetAllFlowAtom);
      else {
        store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "mint" });
        store.set(resetFlowAtom);
      }
      callbacks.forEach(callback => callback());
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(calls, transition === "action navigation" ? 12 : 0);
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
}
