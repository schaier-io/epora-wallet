// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateInWorker, retainLocalEvaluationWorker, warmLocalEvaluationWorker, LOCAL_EVALUATION_IDLE_MS, LOCAL_EVALUATION_TIMEOUT_MS, type LocalEvaluationRequest } from "./local-evaluation-worker";

const request: LocalEvaluationRequest = { txHex: "80", utxos: [], network: "preprod", costModels: [[1], [2], [3]] };
const action = { tag: "MINT", index: 0, budget: { mem: 20, steps: 40 } };
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor(readonly url: URL, readonly options: WorkerOptions) { FakeWorker.instances.push(this); }
}
const latest = () => FakeWorker.instances.at(-1)!;
beforeEach(() => { vi.useFakeTimers(); FakeWorker.instances = []; vi.stubGlobal("Worker", FakeWorker); });
afterEach(async () => { await vi.runAllTimersAsync(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("local evaluation worker lifetime", () => {
  it("keeps the worker warm past idle expiry while an editor owns it", async () => {
    const release = retainLocalEvaluationWorker();
    const warm = warmLocalEvaluationWorker();
    await vi.advanceTimersByTimeAsync(0);
    latest().onmessage!({ data: { ok: true, ready: true } });
    await warm;
    await vi.advanceTimersByTimeAsync(LOCAL_EVALUATION_IDLE_MS * 2);
    expect(latest().terminate).not.toHaveBeenCalled();
    const evaluation = evaluateInWorker(request);
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWorker.instances).toHaveLength(1);
    latest().onmessage!({ data: { ok: true, actions: [action] } });
    await evaluation;
    release();
    await vi.advanceTimersByTimeAsync(LOCAL_EVALUATION_IDLE_MS - 1);
    expect(latest().terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(latest().terminate).toHaveBeenCalledTimes(1);
  });

  it("waits for all owners and permits repeated release", async () => {
    const first = retainLocalEvaluationWorker();
    const second = retainLocalEvaluationWorker();
    const warm = warmLocalEvaluationWorker();
    await vi.advanceTimersByTimeAsync(0);
    latest().onmessage!({ data: { ok: true, ready: true } });
    await warm;
    first();
    first();
    await vi.advanceTimersByTimeAsync(LOCAL_EVALUATION_IDLE_MS);
    expect(latest().terminate).not.toHaveBeenCalled();
    second();
    await vi.advanceTimersByTimeAsync(LOCAL_EVALUATION_IDLE_MS);
    expect(latest().terminate).toHaveBeenCalledTimes(1);
  });

  it("does not end an active request when its final owner leaves", async () => {
    const release = retainLocalEvaluationWorker();
    const evaluation = evaluateInWorker(request);
    await vi.advanceTimersByTimeAsync(0);
    release();
    expect(latest().terminate).not.toHaveBeenCalled();
    latest().onmessage!({ data: { ok: true, actions: [action] } });
    await evaluation;
    await vi.advanceTimersByTimeAsync(LOCAL_EVALUATION_IDLE_MS);
    expect(latest().terminate).toHaveBeenCalledTimes(1);
  });

  it("recreates a failed worker without losing editor ownership", async () => {
    const release = retainLocalEvaluationWorker();
    const failed = evaluateInWorker(request);
    await vi.advanceTimersByTimeAsync(0);
    latest().onerror!();
    await expect(failed).rejects.toThrow("worker failed");
    const next = evaluateInWorker(request);
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWorker.instances).toHaveLength(2);
    latest().onmessage!({ data: { ok: true, actions: [action] } });
    await next;
    await vi.advanceTimersByTimeAsync(LOCAL_EVALUATION_IDLE_MS);
    expect(latest().terminate).not.toHaveBeenCalled();
    release();
  });

  it("warms only the runtime and reuses it for evaluation", async () => {
    const warm = warmLocalEvaluationWorker();
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().postMessage).toHaveBeenCalledWith({ type: "warm" });
    latest().onmessage!({ data: { ok: true, ready: true } });
    await expect(warm).resolves.toBeUndefined();
    const evaluation = evaluateInWorker(request);
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(latest().postMessage).toHaveBeenLastCalledWith(request);
    latest().onmessage!({ data: { ok: true, actions: [action] } });
    await expect(evaluation).resolves.toEqual([action]);
  });

  it("does not interrupt evaluation when queued warmup is cancelled", async () => {
    const evaluation = evaluateInWorker(request);
    const controller = new AbortController();
    const warm = warmLocalEvaluationWorker(controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error("selection changed"));
    await expect(warm).rejects.toThrow("selection changed");
    expect(latest().terminate).not.toHaveBeenCalled();
    latest().onmessage!({ data: { ok: true, actions: [action] } });
    await evaluation;
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().postMessage).toHaveBeenCalledTimes(1);
  });

  it("terminates pending warmup on cancellation", async () => {
    const controller = new AbortController();
    const warm = warmLocalEvaluationWorker(controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error("unmounted"));
    await expect(warm).rejects.toThrow("unmounted");
    expect(latest().terminate).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed warmup readiness", async () => {
    const warm = warmLocalEvaluationWorker();
    await vi.advanceTimersByTimeAsync(0);
    latest().onmessage!({ data: { ok: true, actions: [action] } });
    await expect(warm).rejects.toThrow("malformed response");
    expect(latest().terminate).toHaveBeenCalledTimes(1);
  });

  it("skips warmup without browser Worker support", async () => {
    vi.stubGlobal("Worker", undefined);
    await expect(warmLocalEvaluationWorker()).resolves.toBeUndefined();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("serializes requests and reuses the warm worker", async () => {
    const first = evaluateInWorker(request);
    const second = evaluateInWorker(request);
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().postMessage).toHaveBeenCalledTimes(1);
    latest().onmessage!({ data: { ok: true, actions: [action] } });
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(latest().postMessage).toHaveBeenCalledTimes(2);
    latest().onmessage!({ data: { ok: true, actions: [action] } });
    await expect(second).resolves.toEqual([action]);
  });

  it("rejects queued cancellation without stopping the active worker", async () => {
    const first = evaluateInWorker(request);
    const controller = new AbortController();
    const queued = evaluateInWorker(request, controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    const reason = new Error("queued cancellation");
    controller.abort(reason);
    await expect(queued).rejects.toBe(reason);
    expect(latest().terminate).not.toHaveBeenCalled();
    latest().onmessage!({ data: { ok: true, actions: [action] } });
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().postMessage).toHaveBeenCalledTimes(1);
  });

  it("creates a fresh worker after a failed evaluation", async () => {
    const first = evaluateInWorker(request);
    await vi.advanceTimersByTimeAsync(0);
    latest().onerror!();
    await expect(first).rejects.toThrow("worker failed");
    const second = evaluateInWorker(request);
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWorker.instances).toHaveLength(2);
    latest().onmessage!({ data: { ok: true, actions: [action] } });
    await expect(second).resolves.toEqual([action]);
  });

  it("sends explicit context, returns budgets, and keeps the worker until idle", async () => {
    const pending = evaluateInWorker(request);
    await Promise.resolve();
    expect(latest().url.pathname).toContain("local-evaluation.worker.ts");
    expect(latest().options).toEqual({ type: "module" });
    expect(latest().postMessage).toHaveBeenCalledWith(request);
    latest().onmessage!({ data: { ok: true, actions: [action] } });
    await expect(pending).resolves.toEqual([action]);
    expect(latest().terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LOCAL_EVALUATION_IDLE_MS);
    expect(latest().terminate).toHaveBeenCalledTimes(1);
  });

  it.each(["onerror", "onmessageerror"] as const)("terminates after %s", async callback => {
    const pending = evaluateInWorker(request);
    await Promise.resolve();
    latest()[callback]!();
    await expect(pending).rejects.toThrow(/Local evaluation/);
    expect(latest().terminate).toHaveBeenCalledTimes(1);
  });

  it.each([["VOTING", "VOTE"], ["PROPOSING", "PROPOSE"]])("normalizes Scalus %s to Mesh %s", async (scalusTag, meshTag) => {
    const pending = evaluateInWorker(request);
    await Promise.resolve();
    latest().onmessage!({ data: { ok: true, actions: [{ ...action, tag: scalusTag }] } });
    await expect(pending).resolves.toEqual([{ ...action, tag: meshTag }]);
  });

  it.each([
    null, { ok: false, error: "Script rejected" }, { ok: true, actions: [] },
    { ok: true, actions: [{ ...action, index: -1 }] },
    { ok: true, actions: [{ ...action, tag: "UNKNOWN" }] },
    { ok: true, actions: [{ ...action, budget: { mem: Infinity, steps: 40 } }] },
    { ok: true, actions: [{ ...action, budget: { mem: 0, steps: 40 } }] },
    { ok: true, actions: [{ ...action, budget: { mem: 20, steps: 0.5 } }] },
    { ok: true, actions: [action, action] },
    { ok: true, actions: [{ ...action, tag: "VOTING" }, { ...action, tag: "VOTE" }] }
  ])("rejects malformed or failed responses: %j", async response => {
    const pending = evaluateInWorker(request);
    await Promise.resolve();
    latest().onmessage!({ data: response });
    await expect(pending).rejects.toThrow();
    expect(latest().terminate).toHaveBeenCalledTimes(1);
  });

  it("terminates after the bounded timeout", async () => {
    vi.useFakeTimers();
    const pending = evaluateInWorker(request);
    await Promise.resolve();
    const rejection = expect(pending).rejects.toThrow("Local evaluation timed out.");
    await vi.advanceTimersByTimeAsync(LOCAL_EVALUATION_TIMEOUT_MS);
    await rejection;
    expect(latest().terminate).toHaveBeenCalledTimes(1);
  });

  it("terminates on abort and ignores late worker results", async () => {
    const controller = new AbortController();
    const pending = evaluateInWorker(request, controller.signal);
    await Promise.resolve();
    const reason = new Error("cancelled");
    controller.abort(reason);
    expect(latest().onmessage).toBeNull();
    await expect(pending).rejects.toBe(reason);
    expect(latest().terminate).toHaveBeenCalledTimes(1);
  });

  it("does not create a worker after pre-abort", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => evaluateInWorker(request, controller.signal)).toThrow();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("rejects when Worker is unavailable", async () => {
    vi.stubGlobal("Worker", undefined);
    await expect(evaluateInWorker(request)).rejects.toThrow("workers are unavailable");
  });

  it("terminates if sending context fails", async () => {
    vi.stubGlobal("Worker", class extends FakeWorker {
      constructor(url: URL, options: WorkerOptions) {
        super(url, options);
        this.postMessage.mockImplementation(() => { throw new Error("cannot clone"); });
      }
    });
    await expect(evaluateInWorker(request)).rejects.toThrow("cannot clone");
    expect(latest().terminate).toHaveBeenCalledTimes(1);
  });
});
