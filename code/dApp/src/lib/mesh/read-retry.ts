import type { ChainMethod } from "@/lib/types/contracts";
import { abortable } from "./build-cancellation";

export const MESH_READ_TIMEOUT_MS = 15_000;
export const MESH_CLIENT_READ_TIMEOUT_MS = 20_000;
const MAX_READ_ATTEMPTS = 3;
const READ_RETRY_DELAY_MS = 250;
const MAX_READ_RETRY_DELAY_MS = 1_000;

/** Select read methods for retries. Evaluation and submission execute once. */
export function isMeshRead(method: ChainMethod): boolean {
  return method !== "submitTx" && method !== "evaluateTx";
}

/** Wait before a retry and clear the timer when the caller aborts. */
export function waitForReadRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// One deadline covers every attempt and backoff. Aborting ends the caller even
// when the provider cannot cancel its own request; no later attempt starts.
/** Retry eligible reads within one deadline, with at most three attempts and bounded delays. */
export async function retryMeshRead<T>(
  method: ChainMethod,
  run: (signal?: AbortSignal) => Promise<T>,
  retryDelay: (error: unknown, attempt: number) => number | undefined,
  callerSignal?: AbortSignal,
  timeoutMs = MESH_READ_TIMEOUT_MS
): Promise<T> {
  if (!isMeshRead(method)) return run(callerSignal);
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
  for (let attempt = 1; ; attempt++) {
    try {
      return await abortable(signal, () => run(signal));
    } catch (error) {
      signal.throwIfAborted();
      const delay = retryDelay(error, attempt);
      if (attempt >= MAX_READ_ATTEMPTS || delay === undefined
        || !Number.isFinite(delay) || delay < 0 || delay > MAX_READ_RETRY_DELAY_MS) throw error;
      await waitForReadRetry(delay, signal);
    }
  }
}

/** Return the backoff for an attempt. The retry loop rejects delays above its limit. */
export function meshReadRetryDelay(attempt: number): number {
  return READ_RETRY_DELAY_MS * attempt;
}
