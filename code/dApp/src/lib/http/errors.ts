// Shared HTTP error helpers. Isomorphic (no "server-only") so the client RPC
// layer (lib/mesh/server-fetcher.ts) and the API routes can share getErrorMessage.

/** Best-effort human-readable message from an unknown thrown value. */
export function getErrorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const message = "message" in error ? (error as { message?: unknown }).message : undefined;
    const info = "info" in error ? (error as { info?: unknown }).info : undefined;

    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }

    if (typeof info === "string" && info.trim().length > 0) {
      return info;
    }
  }

  return fallback;
}

// Make an arbitrary value safe for JSON.stringify (and thus NextResponse.json):
// bigints — pervasive in this app's Cardano/ex-unit values — become strings, and
// circular references are cut. Without this, a thrown object carrying a bigint or
// a cycle (directly, or via Error.cause) would make the JSON error response
// itself throw and mask the original error.
function toJsonSafe(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((entry) => toJsonSafe(entry, seen));
  }
  const safe: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    safe[key] = toJsonSafe(entry, seen);
  }
  return safe;
}

// Build a client-safe error payload for a JSON response. Name + message are
// always included; stack and cause are exposed only outside production so we
// never leak server internals (paths, structure) to callers in prod. Every
// exposed branch is run through toJsonSafe so a non-serializable thrown value
// can't make the response itself throw.
export function serializeErrorForResponse(error: unknown): Record<string, unknown> {
  const exposeInternals = process.env.NODE_ENV !== "production";

  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message
    };

    if (exposeInternals && error.stack) {
      payload.stack = error.stack;
    }

    if (exposeInternals && "cause" in error) {
      payload.cause = toJsonSafe((error as Error & { cause?: unknown }).cause);
    }

    return payload;
  }

  if (typeof error === "object" && error !== null) {
    return exposeInternals
      ? (toJsonSafe(error) as Record<string, unknown>)
      : { message: getErrorMessage(error) };
  }

  return { value: String(error) };
}
