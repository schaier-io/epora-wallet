// Dependency-free structured logging. Emits one JSON object per line to
// stdout/stderr, which the hosting platform (Vercel) captures and makes
// searchable: the minimum viable error-visibility layer until a dedicated
// error tracker (e.g. Sentry) is wired in. The `reportError` hook below is the
// single seam to forward to such a service later without touching call sites.

export type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

// bigint appears in decoded datum values; JSON.stringify throws on it. Convert
// to string and drop functions so logging never crashes the request it describes.
function safeReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "function") {
    return undefined;
  }
  return value;
}

/**
 * Reduce an unknown thrown value to a small, non-secret shape: name, message,
 * stack, and the chain of `cause` messages. Deliberately does NOT spread the
 * error's arbitrary enumerable properties, which may carry request payloads or
 * secrets.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message
    };
    if (error.stack) {
      payload.stack = error.stack;
    }
    if (error.cause !== undefined) {
      payload.cause = serializeError(error.cause);
    }
    return payload;
  }
  if (typeof error === "string") {
    return { message: error };
  }
  return { message: String(error) };
}

export function formatLogLine(
  level: LogLevel,
  event: string,
  context: LogContext = {},
  ts: string
): string {
  // Spread context FIRST so the reserved fields always win. A context object
  // carrying its own `ts`/`level`/`event` (e.g. a passed-through upstream
  // payload) can't clobber the real log fields.
  return JSON.stringify({ ...context, ts, level, event }, safeReplacer);
}

function now(): string {
  return new Date().toISOString();
}

function emit(level: LogLevel, event: string, context?: LogContext): void {
  const line = formatLogLine(level, event, context, now());
  // warn/error go to stderr so platform log filters can separate them.
  if (level === "info") {
    console.log(line);
  } else {
    console.error(line);
  }
}

export const logger = {
  info(event: string, context?: LogContext): void {
    emit("info", event, context);
  },
  warn(event: string, context?: LogContext): void {
    emit("warn", event, context);
  },
  error(event: string, context?: LogContext): void {
    emit("error", event, context);
    reportError(event, context);
  }
};

// Seam for an external error tracker. Left as a no-op so there is exactly one
// place to add `Sentry.captureException(...)` (see docs/RUNBOOK.md → Observability)
// without changing any caller.
function reportError(_event: string, _context?: LogContext): void {
  // intentionally empty
}
