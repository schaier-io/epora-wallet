// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { isMeshRead, retryMeshRead } from "./read-retry";

afterEach(() => vi.useRealTimers());

it("retries reads at most three times", async () => {
  const run = vi.fn().mockRejectedValue(new Error("upstream unavailable"));
  await expect(retryMeshRead("fetchUTxOs", run, () => 0)).rejects.toThrow("upstream unavailable");
  expect(run).toHaveBeenCalledTimes(3);
});

it.each(["submitTx", "evaluateTx"] as const)("does not retry %s", async (method) => {
  expect(isMeshRead(method)).toBe(false);
  const run = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(retryMeshRead(method, run, () => 0)).rejects.toThrow("Failed to fetch");
  expect(run).toHaveBeenCalledTimes(1);
});

it("preserves cancellation while waiting and clears its timer", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const run = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  const read = retryMeshRead("fetchUTxOs", run, () => 1_000, controller.signal);
  const result = expect(read).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await result;
  expect(run).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("ends a hanging provider read when its shared deadline expires", async () => {
  const run = vi.fn(() => new Promise<never>(() => {}));
  // AbortSignal.timeout uses native timers. This timer keeps Node alive until it fires.
  const keepAlive = setTimeout(() => {}, 100);
  try {
    await expect(retryMeshRead("fetchUTxOs", run, () => 0, undefined, 10))
      .rejects.toMatchObject({ name: "TimeoutError" });
    expect(run).toHaveBeenCalledTimes(1);
  } finally {
    clearTimeout(keepAlive);
  }
});

it("does not shorten a long provider Retry-After", async () => {
  const run = vi.fn().mockRejectedValue(new Error("busy"));
  await expect(retryMeshRead("fetchUTxOs", run, () => 60_000)).rejects.toThrow("busy");
  expect(run).toHaveBeenCalledTimes(1);
});
