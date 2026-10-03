import type { Action, Network, UTxO } from "@meshsdk/common";
import { abortable } from "@/lib/mesh/build-cancellation";

export const LOCAL_EVALUATION_TIMEOUT_MS = 5_000;
export const LOCAL_EVALUATION_IDLE_MS = 30_000;
let sharedWorker: Worker | undefined;
let idleTimeout: ReturnType<typeof setTimeout> | undefined;
let evaluationQueue: Promise<unknown> = Promise.resolve();
let retainedOwners = 0;
let workerBusy = false;

function scheduleIdleTermination() {
  clearTimeout(idleTimeout);
  if (sharedWorker && !workerBusy && retainedOwners === 0) {
    idleTimeout = setTimeout(terminateWorker, LOCAL_EVALUATION_IDLE_MS);
  }
}

export function retainLocalEvaluationWorker(): () => void {
  retainedOwners += 1;
  clearTimeout(idleTimeout);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    retainedOwners -= 1;
    scheduleIdleTermination();
  };
}

function terminateWorker() {
  clearTimeout(idleTimeout);
  sharedWorker?.terminate();
  sharedWorker = undefined;
}

export type LocalEvaluationRequest = {
  txHex: string;
  utxos: UTxO[];
  additionalTxs?: string[];
  network: Network;
  costModels: number[][];
};

type WarmRequest = { type: "warm" };

export type LocalEvaluationAction = Omit<Action, "data">;

function readActions(value: unknown): LocalEvaluationAction[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Local evaluation returned no budgets.");
  const identities = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Local evaluation returned a malformed budget.");
    const action = item as Partial<LocalEvaluationAction>;
    const rawTag: unknown = action.tag;
    const tag = rawTag === "VOTING" ? "VOTE" : rawTag === "PROPOSING" ? "PROPOSE" : action.tag;
    if (!Number.isSafeInteger(action.index) || action.index! < 0 ||
      !["SPEND", "MINT", "CERT", "REWARD", "VOTE", "PROPOSE"].includes(tag ?? "") ||
      !Number.isSafeInteger(action.budget?.mem) || action.budget!.mem <= 0 ||
      !Number.isSafeInteger(action.budget?.steps) || action.budget!.steps <= 0) {
      throw new Error("Local evaluation returned a malformed budget.");
    }
    const key = `${tag}:${action.index}`;
    if (identities.has(key)) throw new Error("Local evaluation returned duplicate budgets.");
    identities.add(key);
    return { tag: tag!, index: action.index!, budget: { mem: action.budget!.mem, steps: action.budget!.steps } };
  });
}

export function evaluateInWorker(request: LocalEvaluationRequest, signal?: AbortSignal): Promise<LocalEvaluationAction[]> {
  signal?.throwIfAborted();
  if (typeof Worker === "undefined") return Promise.reject(new Error("Local evaluation workers are unavailable."));
  return enqueueWorkerRequest(request, signal);
}

export function warmLocalEvaluationWorker(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (typeof Worker === "undefined") return Promise.resolve();
  return enqueueWorkerRequest({ type: "warm" }, signal).then(() => undefined);
}

function enqueueWorkerRequest(request: LocalEvaluationRequest | WarmRequest, signal?: AbortSignal) {
  const pending = evaluationQueue.then(() => runEvaluation(request, signal));
  evaluationQueue = pending.then(() => undefined, () => undefined);
  return abortable(signal, () => pending);
}

function runEvaluation(request: LocalEvaluationRequest | WarmRequest, signal?: AbortSignal): Promise<LocalEvaluationAction[]> {
  signal?.throwIfAborted();
  clearTimeout(idleTimeout);
  const startedAt = performance.now();
  const cold = sharedWorker === undefined;
  return new Promise((resolve, reject) => {
    const worker = sharedWorker ??= new Worker(new URL("./local-evaluation.worker.ts", import.meta.url), { type: "module" });
    workerBusy = true;
    let settled = false;
    const finish = (error?: unknown, actions?: LocalEvaluationAction[]) => {
      if (settled) return;
      settled = true;
      workerBusy = false;
      console.debug("[tx-evaluation:worker]", {
        request: "type" in request ? "warm" : "evaluate", cold,
        outcome: signal?.aborted ? "cancelled" : error === undefined ? "success" : "failed",
        elapsedMs: performance.now() - startedAt
      });
      clearTimeout(timeout);
      signal?.removeEventListener("abort", aborted);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      if (error !== undefined) {
        terminateWorker();
        reject(error);
      } else {
        scheduleIdleTermination();
        resolve(actions!);
      }
    };
    const aborted = () => finish(signal?.reason ?? new DOMException("Build cancelled.", "AbortError"));
    const timeout = setTimeout(() => finish(new Error("Local evaluation timed out.")), LOCAL_EVALUATION_TIMEOUT_MS);
    signal?.addEventListener("abort", aborted, { once: true });
    worker.onmessage = (event: MessageEvent<unknown>) => {
      try {
        const response = event.data as { ok?: unknown; actions?: unknown; ready?: unknown; error?: unknown } | null;
        if (!response || response.ok !== true) {
          throw new Error(typeof response?.error === "string" ? response.error : "Local evaluation returned a malformed response.");
        }
        if ("type" in request) {
          if (response.ready !== true) throw new Error("Local evaluation warmup returned a malformed response.");
          finish(undefined, []);
        } else {
          finish(undefined, readActions(response.actions));
        }
      } catch (error) { finish(error); }
    };
    worker.onerror = () => finish(new Error("Local evaluation worker failed."));
    worker.onmessageerror = () => finish(new Error("Local evaluation response could not be read."));
    try {
      if (signal?.aborted) aborted();
      else worker.postMessage(request);
    } catch (error) { finish(error); }
  });
}
