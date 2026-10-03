// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import type { TxFetcher } from "@/lib/mesh/tx-context";
import { beginBuildPass, createBuildParameterFetcher } from "./build-parameter-fetcher";

const mocks = vi.hoisted(() => ({ local: vi.fn(), remote: vi.fn() }));
vi.mock("./local-draft-evaluation", () => ({ evaluateDraftLocally: mocks.local }));
vi.mock("@/lib/mesh/server-fetcher", () => ({ ServerFetcher: class {
  evaluateTx = mocks.remote;
  get = vi.fn();
  fetchProtocolParameters = vi.fn();
  fetchCostModels = vi.fn();
  fetchAddressUTxOs = vi.fn();
  fetchUTxOs = vi.fn();
} }));
const budgets = [{ tag: "MINT", index: 0, budget: { mem: 20, steps: 40 } }];
beforeEach(() => {
  mocks.local.mockReset().mockResolvedValue(budgets);
  mocks.remote.mockReset().mockResolvedValue(budgets);
  vi.stubGlobal("Worker", class {});
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const setup = () => {
  const fetcher = new ServerFetcher() as unknown as TxFetcher;
  return { fetcher, scoped: createBuildParameterFetcher(fetcher) };
};

describe("evaluation diagnostics", () => {
  it("measures local success without logging transaction data", async () => {
    const { scoped } = setup();
    await expect(scoped.evaluateTx("private-tx")).resolves.toEqual(budgets);
    expect(console.debug).toHaveBeenCalledWith("[tx-build:evaluation]", { phase: "draft", source: "local", outcome: "success", durationMs: expect.any(Number) as number });
    expect(mocks.remote).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.debug).mock.calls)).not.toContain("private-tx");
  });

  it.each([
    ["Local evaluation timed out.", "timeout"],
    ["Local evaluation workers are unavailable.", "evaluation-error"],
    ["Local evaluation requires complete live cost models.", "evaluation-error"],
    ["Local evaluation is missing an input output.", "evaluation-error"],
    ["private-input private-tx secret-provider-error", "evaluation-error"]
  ])("records a fixed fallback reason for %s", async (message, reason) => {
    mocks.local.mockRejectedValue(new Error(message));
    const { scoped } = setup();
    await scoped.evaluateTx("private-tx");
    expect(console.debug).toHaveBeenCalledWith("[tx-build:evaluation]", { phase: "draft", source: "local", outcome: "fallback", reason, durationMs: expect.any(Number) as number });
    expect(console.debug).toHaveBeenCalledWith("[tx-build:evaluation]", { source: "remote", phase: "draft", outcome: "success", fallbackReason: reason, durationMs: expect.any(Number) as number });
    expect(JSON.stringify(vi.mocked(console.debug).mock.calls)).not.toContain("private-");
  });

  it("measures final remote evaluation without a local attempt", async () => {
    const { scoped } = setup();
    beginBuildPass(scoped);
    await scoped.evaluateTx("private-tx");
    expect(mocks.local).not.toHaveBeenCalled();
    expect(console.debug).toHaveBeenCalledWith("[tx-build:evaluation]", { source: "remote", phase: "final", outcome: "success", fallbackReason: undefined, durationMs: expect.any(Number) as number });
  });

  it("preserves remote failure and logs only its outcome", async () => {
    const error = new Error("private-provider-error");
    mocks.remote.mockRejectedValue(error);
    const { scoped } = setup();
    beginBuildPass(scoped);
    await expect(scoped.evaluateTx("private-tx")).rejects.toBe(error);
    expect(console.debug).toHaveBeenCalledWith("[tx-build:evaluation]", { source: "remote", phase: "final", outcome: "failed", fallbackReason: undefined, durationMs: expect.any(Number) as number });
    expect(JSON.stringify(vi.mocked(console.debug).mock.calls)).not.toContain("private-");
  });

  it("records cancellation without remote fallback", async () => {
    const { fetcher, scoped } = setup();
    const controller = new AbortController();
    Object.defineProperty(fetcher, "signal", { value: controller.signal });
    mocks.local.mockImplementation(() => { controller.abort(); throw controller.signal.reason; });
    await expect(scoped.evaluateTx("private-tx")).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.remote).not.toHaveBeenCalled();
    expect(console.debug).toHaveBeenCalledWith("[tx-build:evaluation]", { phase: "draft", source: "local", outcome: "cancelled", reason: "aborted", durationMs: expect.any(Number) as number });
  });
});
