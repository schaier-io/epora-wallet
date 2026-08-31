import type { z } from "zod";
import { collectErrorText } from "@/lib/mesh/transactions/internals";

// The pure half of the tx routes: deciding what a failure means. It is split
// from tx-route.ts because that module is server-only (rate limiting reaches
// Postgres) and so cannot be loaded by the test runner. Same split as
// rate-limit-core.ts and rate-limit.ts.

// Builder failures are the caller's by default: a datum the validator rejects,
// an address with no collateral, an action the current on-chain state does not
// allow. A provider outage is the exception, and the only evidence for it is in
// the wrapped cause chain, so it is matched on text. The heuristic can only
// under-report: an unmatched provider failure is answered as a 400 carrying the
// builder's own message, never as a 500.
const PROVIDER_FAILURE_MARKERS = [
  "blockfrost",
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
  "gateway timeout"
];

export const PROVIDER_UNAVAILABLE_MESSAGE =
  "The chain data provider is unavailable. Try again shortly.";
export const BUILD_FAILED_MESSAGE = "Transaction build failed.";

export function isMeshBuildError(error: unknown): error is Error & { stage?: string } {
  return error instanceof Error && error.name === "MeshBuildError";
}

export function looksLikeProviderFailure(error: unknown) {
  for (const text of collectErrorText(error)) {
    const haystack = text.toLowerCase();
    if (PROVIDER_FAILURE_MARKERS.some((marker) => haystack.includes(marker))) {
      return true;
    }
  }

  return false;
}

/**
 * Name the offending field. Zod's message alone reads "expected object,
 * received undefined", which does not tell a caller which field to fix.
 */
export function describeZodIssue(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) {
    return "Invalid transaction build request.";
  }

  const path = issue.path.join(".");
  return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
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
      message: error.message,
      severity: "info",
      stage: isMeshBuildError(error) ? error.stage : undefined
    };
  }

  return { status: 500, message: BUILD_FAILED_MESSAGE, severity: "error" };
}
