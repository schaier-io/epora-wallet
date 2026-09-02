//// Plain-language state for the scheduled-payment (streaming-payment) payout
//// surface. Pure derivation: no React, no Mesh, so node:test can pin the exact
//// semantics the surface's copy depends on. The view renders the words; this
//// decides which state the words must describe.

import {
  NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS,
  nonAdminStreamingActionCooldownRemainingMs
} from "@/lib/contracts/crank-cooldown";

export type StreamingPaymentRowStatus =
  | { kind: "finished" }
  | { kind: "ended"; endDateMs: number }
  | { kind: "upcoming"; startDateMs: number }
  | { kind: "active" };

/**
 * One row's state, in the order the reader needs to hear it:
 *   - finished: fully settled. The validator removes the entry with this
 *     transaction, so nothing can be paid and the tick box is locked on.
 *   - ended: past its end date with something still unpaid. The remainder can
 *     still be paid out, and paying the last of it closes the payment.
 *   - upcoming: start date ahead of now, so nothing has accrued yet.
 *   - active: inside its run and accruing.
 */
export function deriveStreamingPaymentRowStatus(input: {
  cleanupRequired: boolean;
  startDateMs: number;
  endDateMs: number;
  nowMs: number;
}): StreamingPaymentRowStatus {
  if (input.cleanupRequired) {
    return { kind: "finished" };
  }
  if (input.endDateMs <= input.nowMs) {
    return { kind: "ended", endDateMs: input.endDateMs };
  }
  if (input.startDateMs > input.nowMs) {
    return { kind: "upcoming", startDateMs: input.startDateMs };
  }
  return { kind: "active" };
}

export type StreamingPayoutCooldown = {
  /** True while a payout attempt would be rejected by the cadence gate. */
  blocked: boolean;
  remainingMinutes: number;
  /** Wall-clock time the shared cooldown lifts (rounded up to the minute). */
  retryAtMs: number;
};

/**
 * The wallet-level payout cooldown the surface sits behind. Every non-admin
 * payout crank shares one 30-minute cadence stamp
 * (`crank-cooldown.assertNonAdminStreamingActionWindow`, which the builder
 * calls and which fails the transaction while it is running).
 *
 * An ADMIN crank bypasses the gate (`crankSignerBypassesCooldown`), so the
 * cooldown note is only shown on non-admin authority paths. The path is the
 * surface's best signal for who signs; the transaction itself re-checks the
 * signer against the state, so a wrong path still fails at build time as
 * before -- this note is advisory and changes no transaction behavior.
 */
export function deriveStreamingPayoutCooldown(input: {
  lastNonAdminPayoutAtMs: number | null;
  authorityPath: string;
  txEarliestTimeMs: number;
  nowMs: number;
}): StreamingPayoutCooldown {
  if (input.authorityPath === "admin") {
    return { blocked: false, remainingMinutes: 0, retryAtMs: input.nowMs };
  }

  const remainingMs = nonAdminStreamingActionCooldownRemainingMs(
    input.lastNonAdminPayoutAtMs,
    input.txEarliestTimeMs
  );
  return {
    blocked: remainingMs > 0,
    remainingMinutes: Math.ceil(remainingMs / 60_000),
    // txEarliest + remaining equals the exact stamp + 30 minutes while blocked.
    retryAtMs: input.txEarliestTimeMs + remainingMs
  };
}

/** The cooldown window, in whole minutes, for copy that names it. */
export const STREAMING_PAYOUT_COOLDOWN_MINUTES =
  NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS / 60_000;
