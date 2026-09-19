// Server-side bridge from `logger.error` to Sentry. Lives in its own file so
// the logger keeps zero SDK imports and every capture goes through one place.
// Importing `@sentry/nextjs` here resolves to the server build on Node and the
// edge build in middleware; when Sentry is not initialized (no DSN) the
// capture calls are no-ops, so wiring is safe in every environment.

import * as Sentry from "@sentry/nextjs";

type LogContext = Record<string, unknown>;

/**
 * Forward one `logger.error` call. Callers pass the thrown value under the
 * `err` key, already reduced by `serializeError` to name/message/stack/cause,
 * so the throwable is reconstructed from exactly those safe fields and no
 * arbitrary (possibly secret-bearing) property rides along.
 */
export function captureServerLogError(event: string, context?: LogContext): void {
  const throwable = toThrowable(context?.err);
  if (throwable) {
    Sentry.captureException(throwable, {
      extra: context ? { logEvent: event, logContext: context } : { logEvent: event }
    });
    return;
  }
  Sentry.captureMessage(event, {
    level: "error",
    extra: context ? { logContext: context } : undefined
  });
}

function toThrowable(value: unknown): Error | undefined {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    return new Error(value);
  }
  if (typeof value === "object" && value !== null) {
    const record = value as {
      message?: unknown;
      stack?: unknown;
      name?: unknown;
      cause?: unknown;
    };
    if (typeof record.message === "string" && record.message.length > 0) {
      const error = new Error(record.message);
      // Preserve the recorded name and cause so Sentry groups by the real
      // error class and chain instead of collapsing everything under `Error`.
      if (typeof record.name === "string" && record.name.length > 0) {
        error.name = record.name;
      }
      if (typeof record.stack === "string") {
        error.stack = record.stack;
      }
      if (record.cause !== undefined) {
        error.cause = record.cause;
      }
      return error;
    }
  }
  return undefined;
}
