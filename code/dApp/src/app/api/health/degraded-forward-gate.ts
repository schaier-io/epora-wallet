// Sentry flood control for the health route. An uptime monitor polls
// GET /api/health every 30-60 s (docs/RUNBOOK.md §5), and PR #481 wired every
// failed probe to `logger.error`, which forwards to Sentry. A deployment whose
// database is down therefore emits one Sentry event per poll. This module
// holds the suppression decision: the first failure of a degraded state, any
// change of that state, and one re-announcement per cooldown forward; the
// identical repeats in between stay local. Pure logic first, the stateful gate
// last, so the decision is testable without the route.

import type { HealthResponse } from "@/lib/api/health";

// How long one unchanged degraded state goes between Sentry forwards.
// Monitors poll every 30-60 s, so without suppression a broken deployment
// emits 60-120 events per hour per instance; 5 minutes bounds that to at most
// 12 while keeping first-failure and state-change latency at zero. Documented
// in docs/RUNBOOK.md §7.2.
export const HEALTH_DEGRADED_FORWARD_COOLDOWN_MS = 5 * 60_000;

// One failed dependency probe, in the shape the route logs.
export type HealthProbeFailure = {
  event: string;
  error: unknown;
};

// The stale reason embeds the live cursor age ("recent-head: stale
// (ageMs=1234 > staleAfterMs=1800000)", indexing-freshness.ts `degradation`),
// which grows on every probe. Strip it, or one ongoing stall would produce a
// new signature each poll and never suppress.
const VOLATILE_AGE_DETAIL = /\(ageMs=\d+ > staleAfterMs=\d+\)$/;

// Stable identity of one degraded state: the per-check verdicts plus the
// degraded reasons with the volatile cursor age removed. The response `ts` and
// the indexer's age fields are excluded for the same reason. Two probes that
// describe the same failure agree on this string no matter when they ran.
export function degradedSignature(body: HealthResponse): string {
  const reasons = (body.indexer?.degradedReasons ?? [])
    .map((reason) => reason.replace(VOLATILE_AGE_DETAIL, "").trim());
  return `db=${body.checks.database},indexer=${body.checks.indexer},reasons=${reasons.join("|")}`;
}

// The last degraded state this instance forwarded to Sentry, and when.
export type DegradedForwardRecord = {
  signature: string;
  forwardedAtMs: number;
};

/**
 * Pure forwarding decision for one degraded observation:
 *
 * - no previous record (first failure since process start, or after a healthy
 *   probe cleared the state) forwards;
 * - a changed signature (different checks or reasons) forwards immediately, so
 *   a state change is never hidden;
 * - an identical signature forwards again only once `cooldownMs` has elapsed
 *   since the last forward, so an ongoing identical outage re-announces
 *   periodically instead of falling silent forever.
 */
export function shouldForward(
  previous: DegradedForwardRecord | null | undefined,
  nextSignature: string,
  nowMs: number,
  cooldownMs: number
): boolean {
  if (!previous) {
    return true;
  }
  if (previous.signature !== nextSignature) {
    return true;
  }
  return nowMs - previous.forwardedAtMs >= cooldownMs;
}

// The two log sinks, injected so tests observe the decision without touching
// the logger or Sentry. `forward` emits at error level (and reaches Sentry via
// the logger's reportError seam); `suppress` stays local at info level.
export type DegradedForwardSinks = {
  forward: (failure: HealthProbeFailure) => void;
  suppress: (failure: HealthProbeFailure) => void;
};

// In-process, per-instance gate. The record is one slot (O(1) memory): only
// consecutive repeats are suppressed, so earlier signatures never need
// storing. `observe` is synchronous, with no await between reading and
// writing the record, so interleaved requests cannot race it.
export function createDegradedForwardGate(sinks: DegradedForwardSinks, cooldownMs: number) {
  let lastForwarded: DegradedForwardRecord | null = null;

  return {
    /**
     * Feed one health response through the gate. Degraded responses decide
     * error-forward vs local-suppress for each probe failure; healthy
     * responses close the incident so the next degradation starts fresh. The
     * gate only chooses how failures are logged; callers build and return the
     * HTTP response unchanged.
     */
    observe(body: HealthResponse, nowMs: number, failures: readonly HealthProbeFailure[]): void {
      if (body.status !== "degraded") {
        lastForwarded = null;
        return;
      }

      const signature = degradedSignature(body);
      if (!shouldForward(lastForwarded, signature, nowMs, cooldownMs)) {
        for (const failure of failures) {
          sinks.suppress(failure);
        }
        return;
      }

      // Recorded even when `failures` is empty (a stale-cursor degradation
      // logs nothing today): the state still changed, and recording it here is
      // what lets the next genuinely new failure forward as a change.
      lastForwarded = { signature, forwardedAtMs: nowMs };
      for (const failure of failures) {
        sinks.forward(failure);
      }
    }
  };
}
