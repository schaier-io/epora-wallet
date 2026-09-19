// Dependency-free structured logging. Emits one JSON object per line to
// stdout/stderr, which the hosting platform (Vercel) captures and makes
// searchable: the minimum viable error-visibility layer alongside the Sentry
// error tracker. The `reportError` hook below is the single seam that
// forwards every `logger.error` to Sentry without touching call sites.

import { captureServerLogError } from "./sentry-forward";

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
  return serializeErrorInto(error, true, new WeakSet<object>());
}

/**
 * The response-safe counterpart to {@link serializeError}: the error's name and
 * message chain, never the stack. Stacks name server file paths, so this is the
 * only shape a route may hand back to a client; the full serializer stays for
 * server logs. The build client classifies ledger failures purely off the
 * message text, so messages are the part it needs.
 */
export function serializeErrorDetail(error: unknown): Record<string, unknown> {
  return serializeErrorInto(error, false, new WeakSet<object>());
}

// Provider errors arrive through several unwrap layers, and a buggy or
// adversarial `cause` chain can form a cycle. Both serializers traverse with a
// visited set so the chain terminates: an already-serialized error is reduced
// to its name and message without recursing into its cause again.
function serializeErrorInto(
  error: unknown,
  includeStack: boolean,
  visited: WeakSet<object>
): Record<string, unknown> {
  if (error instanceof Error) {
    if (visited.has(error)) {
      return { name: error.name, message: error.message };
    }
    visited.add(error);
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message
    };
    if (includeStack && error.stack) {
      payload.stack = error.stack;
    }
    if (error.cause !== undefined) {
      payload.cause = serializeErrorInto(error.cause, includeStack, visited);
    }
    return payload;
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

// Seam for the external error tracker (Sentry). Every `logger.error` forwards
// here; the bridge lives in `sentry-forward.ts` so this module keeps zero SDK
// imports. It initializes to a no-op unless Sentry is configured (a DSN env
// var), so call sites never branch on whether monitoring is enabled.
// See docs/RUNBOOK.md, "Observability".
function reportError(event: string, context?: LogContext): void {
  captureServerLogError(event, context);
}
