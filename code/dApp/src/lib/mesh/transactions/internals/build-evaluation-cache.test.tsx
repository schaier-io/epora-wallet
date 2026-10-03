// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { beginBuildPass, createBuildParameterFetcher } from "./build-parameter-fetcher";
import { evaluateDraftLocally } from "./local-draft-evaluation";

vi.mock("./local-draft-evaluation", () => ({ evaluateDraftLocally: vi.fn() }));

const budgets = [{ tag: "SPEND" as const, index: 0, budget: { mem: 1, steps: 2 } }];

beforeEach(() => {
  vi.stubGlobal("Worker", class {});
  vi.mocked(evaluateDraftLocally).mockReset().mockResolvedValue(budgets);
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("never reuses local draft budgets for final remote evaluation", async () => {
  const fetcher = new ServerFetcher();
  const remote = vi.spyOn(fetcher, "evaluateTx").mockResolvedValue(budgets);
  const scoped = createBuildParameterFetcher(fetcher);
  await Promise.all([scoped.evaluateTx("same-candidate"), scoped.evaluateTx("same-candidate")]);
  expect(evaluateDraftLocally).toHaveBeenCalledTimes(1);
  expect(remote).not.toHaveBeenCalled();
  expect(console.debug).toHaveBeenCalledWith("[tx-build:evaluation]", {
    phase: "draft", source: "local", outcome: "success", durationMs: expect.any(Number) as number
  });
  beginBuildPass(scoped);
  await Promise.all([scoped.evaluateTx("same-candidate"), scoped.evaluateTx("same-candidate")]);
  expect(remote).toHaveBeenCalledTimes(1);
  expect(evaluateDraftLocally).toHaveBeenCalledTimes(1);
});

it.each([
  ["Local evaluation timed out.", "timeout"],
  ["Secret transaction candidate or address", "evaluation-error"]
])("reports a safe reason for %s and reuses the remote fallback", async (message, reason) => {
  vi.mocked(evaluateDraftLocally).mockRejectedValue(new Error(message));
  const fetcher = new ServerFetcher();
  const remote = vi.spyOn(fetcher, "evaluateTx").mockResolvedValue(budgets);
  const scoped = createBuildParameterFetcher(fetcher);
  await scoped.evaluateTx("secret-cbor");
  await scoped.evaluateTx("secret-cbor");
  expect(evaluateDraftLocally).toHaveBeenCalledTimes(1);
  expect(remote).toHaveBeenCalledTimes(1);
  expect(console.debug).toHaveBeenCalledWith("[tx-build:evaluation]", {
    phase: "draft", source: "local", outcome: "fallback", reason, durationMs: expect.any(Number) as number
  });
  const record = vi.mocked(console.debug).mock.calls[0][1] as { durationMs: number };
  expect(Number.isFinite(record.durationMs)).toBe(true);
  expect(record.durationMs).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(record)).not.toContain(message);
  expect(JSON.stringify(record)).not.toContain("secret-cbor");
  beginBuildPass(scoped);
  await scoped.evaluateTx("secret-cbor");
  expect(remote).toHaveBeenCalledTimes(2);
});

it("does not fall back to the provider after local cancellation", async () => {
  const controller = new AbortController();
  vi.mocked(evaluateDraftLocally).mockImplementation(async () => {
    controller.abort();
    throw controller.signal.reason;
  });
  const fetcher = new ServerFetcher({ signal: controller.signal });
  const remote = vi.spyOn(fetcher, "evaluateTx").mockResolvedValue(budgets);
  const scoped = createBuildParameterFetcher(fetcher);
  await expect(scoped.evaluateTx("candidate")).rejects.toMatchObject({ name: "AbortError" });
  await expect(scoped.evaluateTx("candidate")).rejects.toMatchObject({ name: "AbortError" });
  expect(remote).not.toHaveBeenCalled();
  expect(console.debug).toHaveBeenCalledWith("[tx-build:evaluation]", {
    phase: "draft", source: "local", outcome: "cancelled", reason: "aborted", durationMs: expect.any(Number) as number
  });
});
