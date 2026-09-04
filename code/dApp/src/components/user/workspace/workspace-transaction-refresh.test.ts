import assert from "node:assert/strict";
import test from "node:test";
import { schedulePostSubmitRefresh } from "./workspace-transaction-refresh";

test("settles every timer refresh batch before discarding its result", async () => {
  const callbacks: Array<() => void> = [];
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalAllSettled = Promise.allSettled.bind(Promise);
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
      return originalAllSettled(values);
    }
  });

  const refresh = async () => undefined;
  const deps = {
    postSubmitRefreshTimersRef: { current: [] },
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
    Object.defineProperty(Promise, "allSettled", {
      configurable: true,
      value: originalAllSettled
    });
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
