// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineEvaluatorScalus } from "@meshsdk/core-cst";
import type { IFetcher, RedeemerTagType } from "@meshsdk/common";
import { createOfflineMintFixture, DEFAULT_OFFLINE_COST_MODELS } from "./offline-evaluation-mint-fixture";
import { createOfflineActionFixture } from "./offline-evaluation-action-fixture";
import type { LocalEvaluationRequest, LocalEvaluationAction } from "./internals/local-evaluation-worker";

const worker = vi.hoisted(() => ({ evaluate: vi.fn() }));
vi.mock("./internals/local-evaluation-worker", () => ({ evaluateInWorker: worker.evaluate }));

async function actualLocalEvaluation(request: LocalEvaluationRequest) {
  const fetcher = { fetchUTxOs: async () => { throw new Error("worker attempted chain access"); } } as unknown as IFetcher;
  const evaluator = new OfflineEvaluatorScalus(fetcher, request.network, undefined, request.costModels);
  const result = await evaluator.evaluateTx(request.txHex, request.utxos);
  return result.map(action => ({ ...action, tag: ((action.tag as string) === "VOTING" ? "VOTE" : action.tag) as RedeemerTagType }));
}

async function mintContext() {
  vi.stubGlobal("Worker", undefined);
  const fixture = await createOfflineMintFixture();
  const evaluator = new OfflineEvaluatorScalus(fixture.fetcher, "preprod", undefined, DEFAULT_OFFLINE_COST_MODELS);
  const remote = vi.fn((txHex: string) => evaluator.evaluateTx(txHex, fixture.utxos));
  fixture.fetcher.evaluateTx = remote;
  vi.stubGlobal("Worker", class {});
  return { ...fixture, remote };
}

beforeEach(() => {
  worker.evaluate.mockReset().mockImplementation(actualLocalEvaluation);
  vi.stubGlobal("Worker", class {});
});
afterEach(() => vi.unstubAllGlobals());

describe("hybrid evaluation with actual project scripts", () => {
  it("evaluates mint draft locally and final remotely with matching real budgets", async () => {
    const fixture = await mintContext();
    const built = await fixture.build();
    expect(worker.evaluate).toHaveBeenCalledTimes(1);
    expect(fixture.remote).toHaveBeenCalledTimes(1);
    const local = await (worker.evaluate.mock.results[0]!.value as Promise<LocalEvaluationAction[]>);
    const remote = await (fixture.remote.mock.results[0]!.value as Promise<LocalEvaluationAction[]>);
    expect(local).toEqual(remote);
    expect(local[0]!.budget).toEqual({ mem: 470_102, steps: 147_666_434 });
    expect(built.executionUnits?.redeemers).toHaveLength(1);
  }, 30_000);

  it("normalizes actual voting evaluation and preserves final remote validation", async () => {
    const fixture = await createOfflineActionFixture("vote");
    const original = fixture.fetcher.evaluateTx;
    const remote = vi.fn(async (txHex: string) => (await original(txHex)).map(action => ({ ...action, tag: ((action.tag as string) === "VOTING" ? "VOTE" : action.tag) as RedeemerTagType })));
    fixture.fetcher.evaluateTx = remote;
    const built = await fixture.build();
    expect(worker.evaluate).toHaveBeenCalledTimes(1);
    expect(remote).toHaveBeenCalledTimes(1);
    expect((await (worker.evaluate.mock.results[0]!.value as Promise<LocalEvaluationAction[]>)).map((action: { tag: string }) => action.tag)).toEqual(["SPEND", "VOTE"]);
    expect(built.executionUnits?.redeemers).toHaveLength(2);
    expect(built.executionUnits?.redeemers.some(redeemer => redeemer.validator?.includes("vote"))).toBe(true);
  }, 30_000);

  it("rejects a successful local draft when final remote evaluation rejects", async () => {
    const fixture = await mintContext();
    fixture.remote.mockRejectedValue(new Error("remote final rejected fixture"));
    await expect(fixture.build()).rejects.toThrow("remote final rejected fixture");
    expect(worker.evaluate).toHaveBeenCalledTimes(1);
    expect(fixture.remote).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("falls back to remote draft and final after worker failure", async () => {
    const fixture = await mintContext();
    worker.evaluate.mockRejectedValue(new Error("worker unavailable"));
    await fixture.build();
    expect(worker.evaluate).toHaveBeenCalledTimes(1);
    expect(fixture.remote).toHaveBeenCalledTimes(2);
  }, 30_000);

  it("does not fall back after abort during local evaluation", async () => {
    const fixture = await mintContext();
    const controller = new AbortController();
    Object.defineProperty(fixture.fetcher, "signal", { value: controller.signal });
    worker.evaluate.mockImplementation(() => {
      const reason = new DOMException("fixture cancelled", "AbortError");
      controller.abort(reason);
      throw reason;
    });
    await expect(fixture.build()).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.evaluate).toHaveBeenCalledTimes(1);
    expect(fixture.remote).not.toHaveBeenCalled();
  }, 30_000);

  it("falls back when live models are incomplete while retaining valid V3 hash refresh", async () => {
    const fixture = await mintContext();
    const original = fixture.fetcher.get;
    fixture.fetcher.get = async path => path === "epochs/latest/parameters"
      ? { cost_models_raw: { PlutusV3: DEFAULT_OFFLINE_COST_MODELS[2] } }
      : original(path);
    await fixture.build();
    expect(worker.evaluate).not.toHaveBeenCalled();
    expect(fixture.remote).toHaveBeenCalledTimes(2);
  }, 30_000);

  it("keeps both evaluations remote without worker support", async () => {
    const fixture = await mintContext();
    vi.stubGlobal("Worker", undefined);
    await fixture.build();
    expect(worker.evaluate).not.toHaveBeenCalled();
    expect(fixture.remote).toHaveBeenCalledTimes(2);
  }, 30_000);
});
