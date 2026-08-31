import type { z } from "zod";

// The pure half of the tx routes: deciding what a failure means. It is split
// from tx-route.ts because that module is server-only (rate limiting reaches
// Postgres) and so cannot be loaded by the test runner. Same split as
// rate-limit-core.ts and rate-limit.ts.

// Builder failures are the caller's by default: a datum the validator rejects,
// an address with no collateral, an action the current on-chain state does not
// allow. A provider outage is the exception, and the only evidence for it is in
// the wrapped cause chain, so it is matched on text.
//
// Two rules keep that match honest, both learned by measuring it against a live
// preprod build:
//
//   1. Only messages are searched, never stacks and never `details`. Every
//      staged builder error carries setup diagnostics naming the provider
//      ("blockfrost-via-server-route"), so searching the whole error graph
//      matched essentially every build failure.
//   2. The provider's name is not a marker. It appears in our own diagnostics
//      and in perfectly ordinary messages. Only transport and gateway failures
//      count, because only those mean the provider itself is unreachable.
//
// The rule can only under-report: an unmatched provider failure is answered as
// a 400 carrying the builder's own message, never as a 500.
const PROVIDER_FAILURE_MARKERS = [
  "econnrefused",
  "econnreset",
  "etimedout",
  "enotfound",
  "getaddrinfo",
  "socket hang up",
  "fetch failed",
  "network error",
  "request timed out",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
  "too many requests"
];

/** Blockfrost surfaces its own outages as 5xx and 429 responses. */
const PROVIDER_STATUS_PATTERN = /\bstatus (?:code )?(?:5\d\d|429)\b/;

const MAX_CAUSE_DEPTH = 8;

/**
 * Collect the messages of an error and its causes, and nothing else.
 *
 * `normalizeError` stores each cause as a plain record, so the chain is walked
 * structurally rather than by `instanceof`. Stacks and `details` are skipped on
 * purpose: see rule 1 above.
 */
function collectCauseMessages(value: unknown, messages: string[] = [], depth = 0) {
  if (depth > MAX_CAUSE_DEPTH || value === null || value === undefined) {
    return messages;
  }

  if (typeof value === "string") {
    messages.push(value);
    return messages;
  }

  if (value instanceof Error) {
    messages.push(value.message);
    return collectCauseMessages(value.cause, messages, depth + 1);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string") {
      messages.push(record.message);
    }
    return collectCauseMessages(record.cause, messages, depth + 1);
  }

  return messages;
}

export const PROVIDER_UNAVAILABLE_MESSAGE =
  "The chain data provider is unavailable. Try again shortly.";
export const BUILD_FAILED_MESSAGE = "Transaction build failed.";

// Mesh appends the whole candidate transaction to an evaluation failure, which
// runs to tens of kilobytes. The leading text is the part that names the
// problem, so the message is truncated rather than replaced: the caller keeps a
// usable reason, and the response stays a sane size. The full text is logged.
const MAX_ERROR_MESSAGE_LENGTH = 500;

export function boundErrorMessage(message: string) {
  return message.length <= MAX_ERROR_MESSAGE_LENGTH
    ? message
    : `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH).trimEnd()}...`;
}

export function isMeshBuildError(error: unknown): error is Error & { stage?: string } {
  return error instanceof Error && error.name === "MeshBuildError";
}

export function looksLikeProviderFailure(error: unknown) {
  return collectCauseMessages(error).some((message) => {
    const haystack = message.toLowerCase();
    return (
      PROVIDER_FAILURE_MARKERS.some((marker) => haystack.includes(marker)) ||
      PROVIDER_STATUS_PATTERN.test(haystack)
    );
  });
}

/**
 * Name the offending field. Zod's message alone reads "expected object,
 * received undefined", which does not tell a caller which field to fix.
 *
 * Bounded like every other error body: a deep path or a wide union can make
 * zod's own message long, and every `/api/v1/tx/*` failure answers with at
 * most `MAX_ERROR_MESSAGE_LENGTH` characters.
 */
export function describeZodIssue(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) {
    return "Invalid transaction build request.";
  }

  const path = issue.path.join(".");
  return boundErrorMessage(path.length > 0 ? `${path}: ${issue.message}` : issue.message);
}

export type BuildFailure = {
  status: 400 | 500 | 502;
  /** Safe to return to the caller. Never carries provider detail. */
  message: string;
  /** Whether the failure is ours to investigate, or the caller's to fix. */
  severity: "info" | "error";
  stage?: string;
};

/**
 * Map a builder failure onto a documented status code.
 *
 * A build fails because the caller asked for something the chain state does not
 * allow far more often than because the provider broke, so 400 is the default
 * and the builder's own message is returned: those messages name the missing
 * input. Builders raise both wrapped `MeshBuildError`s and plain `Error`s
 * ("Wallet script parameters are missing."), and both are the caller's.
 */
export function classifyBuildFailure(error: unknown): BuildFailure {
  if (looksLikeProviderFailure(error)) {
    // The provider's own message can name hosts, keys and internal endpoints,
    // so it is logged, never returned.
    return { status: 502, message: PROVIDER_UNAVAILABLE_MESSAGE, severity: "error" };
  }

  if (error instanceof Error) {
    return {
      status: 400,
      message: boundErrorMessage(error.message),
      severity: "info",
      stage: isMeshBuildError(error) ? error.stage : undefined
    };
  }

  return { status: 500, message: BUILD_FAILED_MESSAGE, severity: "error" };
}
