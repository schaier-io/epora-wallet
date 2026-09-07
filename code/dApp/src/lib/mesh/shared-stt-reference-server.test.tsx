// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), env: vi.fn(), provider: {} }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server-env", () => ({ getServerEnv: mocks.env }));
vi.mock("@/lib/mesh/blockfrost-server", () => ({ getBlockfrostProvider: () => mocks.provider }));
vi.mock("@meshsdk/core", () => ({ resolveScriptHash: () => "hash" }));
vi.mock("@/lib/contracts/blueprint", () => ({ getSttSpendScript: () => ({code: "aa", version: "V3"}), getSttMintPolicyId: () => "policy" }));
vi.mock("./shared-stt-reference-discovery", () => ({ discoverSharedSttReference: (fetcher: unknown, script: unknown): unknown => mocks.inspect(fetcher, {script, discovery: true}) }));
vi.mock("./transactions/internals/reference-scripts", () => ({ inspectSharedSttReferenceStore: mocks.inspect }));
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); mocks.env.mockReturnValue({}); mocks.inspect.mockReset(); });
afterEach(() => vi.useRealTimers());
const ready = { storeAddress: "store", expectedScriptHash: "hash", checkedReferenceCount: 1, matchingReferences: [{reference: "tx#0"}] };
it("discovers once for concurrent callers and caches the result for 60 seconds", async () => {
  mocks.inspect.mockResolvedValue(ready);
  const { resolveSharedSttReferenceServer: resolve } = await import("./shared-stt-reference-server");
  const [a,b] = await Promise.all([resolve(),resolve()]);
  expect(a.activeReference).toBe("tx#0"); expect(b).toEqual(a);
  expect(mocks.inspect).toHaveBeenCalledTimes(1);
  expect(mocks.inspect).toHaveBeenCalledWith(mocks.provider, expect.objectContaining({discovery:true}));
  await vi.advanceTimersByTimeAsync(60_001); await resolve();
  expect(mocks.inspect).toHaveBeenCalledTimes(2);
});
it("verifies configured references without discovery", async () => {
  mocks.env.mockReturnValue({SHARED_STT_REFERENCE:"configured#0"}); mocks.inspect.mockResolvedValue(ready);
  const { resolveSharedSttReferenceServer: resolve } = await import("./shared-stt-reference-server");
  await resolve();
  expect(mocks.inspect).toHaveBeenCalledWith(mocks.provider, expect.objectContaining({configuredReference:"configured#0"}));
});
it("retries missing results after five seconds", async () => {
  mocks.inspect.mockResolvedValue({...ready, matchingReferences:[]});
  const { resolveSharedSttReferenceServer: resolve } = await import("./shared-stt-reference-server");
  expect((await resolve()).status).toBe("missing"); await resolve();
  expect(mocks.inspect).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5_001); mocks.inspect.mockResolvedValue(ready);
  expect((await resolve()).status).toBe("ready");
});
it("deduplicates failed calls and retries after five seconds", async () => {
  mocks.inspect.mockRejectedValue(new Error("provider unavailable"));
  const { resolveSharedSttReferenceServer: resolve } = await import("./shared-stt-reference-server");
  await expect(resolve()).rejects.toThrow("provider unavailable");
  await expect(resolve()).rejects.toThrow("provider unavailable");
  expect(mocks.inspect).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5_001); mocks.inspect.mockResolvedValue(ready);
  expect((await resolve()).status).toBe("ready");
});
it("requires a verified active reference for transaction builds", async () => {
  mocks.inspect.mockResolvedValue({...ready, matchingReferences:[]});
  const { requireSharedSttReferenceServer: requireReference } = await import("./shared-stt-reference-server");
  await expect(requireReference()).rejects.toThrow("SHARED_HELPER_UNAVAILABLE");
});
it("hides provider detail when transaction builds require the helper", async () => {
  mocks.inspect.mockRejectedValue(new Error("internal provider details"));
  const { requireSharedSttReferenceServer: requireReference } = await import("./shared-stt-reference-server");
  await expect(requireReference()).rejects.toThrow(/^SHARED_HELPER_UNAVAILABLE$/);
});
