import assert from "node:assert/strict";
import test from "node:test";
import { schedulePostSubmitRefresh } from "./workspace-transaction-refresh";

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
