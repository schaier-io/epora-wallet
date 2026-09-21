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
