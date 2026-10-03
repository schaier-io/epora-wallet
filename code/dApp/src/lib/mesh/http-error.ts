import { parseRetryAfterMs } from "@/lib/http/retry-after";

// Mesh's BlockfrostProvider throws every HTTP failure as a JSON string built by
// its parseHttpError: `{ data, headers, status }` when the server answered,
// `{ code, message }` or the raw request when it did not.
function errorRecord(error: unknown): Record<string, unknown> | null {
  let value = error;
  // Mesh can serialize an already-serialized provider error again.
  for (let depth = 0; depth < 4 && typeof value === "string"; depth += 1) {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function meshHttpStatus(error: unknown): number | null {
  const status = errorRecord(error)?.status;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : null;
}

export function meshHttpRetryAfter(error: unknown): string | null {
  const headers = errorRecord(error)?.headers;
  if (typeof headers !== "object" || headers === null || Array.isArray(headers)) return null;
  const entry: unknown = Object.entries(headers).find(([key]) => key.toLowerCase() === "retry-after")?.[1];
  if (typeof entry !== "string" && typeof entry !== "number") return null;
  const value = String(entry).trim();
  if (!value || value.length > 128 || /[\r\n]/.test(value)) return null;
  if (/^\d+$/.test(value)) return Number.isFinite(Number(value)) ? value : null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toUTCString() === value ? value : null;
}

// Used when Blockfrost answers 429 without a Retry-After: the public API
// promises that every 429 carries one, in seconds.
export const UPSTREAM_RETRY_AFTER_FALLBACK_SECONDS = 1;

// A Blockfrost rate limit or outage is not our bug, so a read route must not
// answer it as a 500. An upstream 429 stays a 429, so the caller backs off for
// as long as Blockfrost asks; an upstream 5xx is a bad gateway, a 502. Every
// other failure returns null and stays the route's own decision.
export function meshUpstreamFailure(
  error: unknown
): { status: 429; retryAfterSeconds: string } | { status: 502 } | null {
  const status = meshHttpStatus(error);
  if (status === 429) {
    // Blockfrost may send an HTTP date; the public contract is seconds.
    const delayMs = parseRetryAfterMs(meshHttpRetryAfter(error));
    const seconds = delayMs === undefined ? UPSTREAM_RETRY_AFTER_FALLBACK_SECONDS : Math.ceil(delayMs / 1_000);
    return { status, retryAfterSeconds: String(seconds) };
  }
  return status !== null && status >= 500 ? { status: 502 } : null;
}

// Blockfrost's evaluate endpoint answers HTTP 200 carrying an Ogmios
// `EvaluationFailure` body, and Mesh throws that body as its (doubly
// JSON-encoded) text. A `ScriptFailures` map inside it, empty or not, means a
// validator refused the caller's transaction: a caller-side condition, like a
// 4xx, not a server fault. Every other evaluation failure kind
// (CannotCreateEvaluationContext, AdditionalUtxoOverlap, NotEnoughSynced) says
// the evaluator itself could not run, so it stays unclassified here and keeps
// the error log and the 500.
export function isScriptEvaluationRejection(error: unknown): boolean {
  const record = errorRecord(error instanceof Error ? error.message : error);
  const failure = asRecord(asRecord(record?.result)?.EvaluationFailure);
  return failure !== null && asRecord(failure.ScriptFailures) !== null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}


/** Confirmed outputs must not also appear in Ogmios's additional UTxO set. */
export function meshEvaluationOverlapRefs(error: unknown): Set<string> | null {
  const record = errorRecord(error instanceof Error ? error.message : error);
  const failure = asRecord(asRecord(record?.result)?.EvaluationFailure);
  if (!failure || Object.keys(failure).length !== 1) return null;
  const overlaps = failure.AdditionalUtxoOverlap;
  if (!Array.isArray(overlaps) || overlaps.length === 0) return null;
  const refs = new Set<string>();
  for (const value of overlaps) {
    const ref = asRecord(value);
    if (typeof ref?.txId !== "string" || !/^[a-fA-F0-9]{64}$/.test(ref.txId) ||
        typeof ref.index !== "number" || !Number.isSafeInteger(ref.index) || ref.index < 0) return null;
    refs.add(`${ref.txId.toLowerCase()}#${ref.index}`);
  }
  return refs;
}
