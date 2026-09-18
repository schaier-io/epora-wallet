import type { StateFormState } from "@/lib/contracts/state-form";

/**
 * The proof-of-life deadline decision, shared by every surface that has to warn about it.
 *
 * The deadline itself lives on-chain in the state datum (`proof_of_life.unlock_time`, a
 * POSIX-time option) and reaches the client through the detected wallet's datum
 * (`stateFormFromDatum`), so every wallet the user can see already carries its own deadline.
 * This module turns that timestamp plus the current time into one of three states, so the
 * wallet-home tile and any reminder surface agree on what "soon" and "late" mean.
 */

export type ProofOfLifeAlertState = "ok" | "approaching" | "overdue";

export type ProofOfLifeAlertEvaluation = {
  state: ProofOfLifeAlertState;
  /** Milliseconds until the deadline. Meaningless when `state` is `"ok"` from a missing deadline (then `0`). */
  remainingMs: number;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Under a week left is close enough that a passing glance has to catch it. */
export const PROOF_OF_LIFE_ALERT_THRESHOLD_MS = 7 * DAY_MS;

export type ProofOfLifeDeadlineSource = Pick<
  StateFormState,
  "proofOfLifeUnlockTimeMode" | "proofOfLifeUnlockTime"
>;

/**
 * The armed deadline as milliseconds since the Unix epoch, or `null` when the timer is off
 * or holds no usable value (`none`, empty, or a non-positive / unparseable number). The form
 * can carry half-typed values while the user edits, so every caller funnels through this
 * guard instead of re-deciding what counts as armed.
 */
export function readProofOfLifeDeadline(form: ProofOfLifeDeadlineSource): number | null {
  if (form.proofOfLifeUnlockTimeMode !== "some") {
    return null;
  }
  const deadlineMs = Number(form.proofOfLifeUnlockTime);
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    return null;
  }
  return deadlineMs;
}

/**
 * Compare one deadline against the current time. A missing deadline reads as `"ok"`, never
 * as overdue: no deadline means nothing to alert about, and a broken value must not raise a
 * false alarm. (`null` would otherwise coerce to `0` in the subtraction and read as
 * long-lapsed.)
 */
export function evaluateProofOfLifeAlert(input: {
  deadlineMs: number | null;
  nowMs: number;
}): ProofOfLifeAlertEvaluation {
  const { deadlineMs, nowMs } = input;
  if (deadlineMs === null) {
    return { state: "ok", remainingMs: 0 };
  }
  const remainingMs = deadlineMs - nowMs;
  if (remainingMs <= 0) {
    return { state: "overdue", remainingMs };
  }
  if (remainingMs <= PROOF_OF_LIFE_ALERT_THRESHOLD_MS) {
    return { state: "approaching", remainingMs };
  }
  return { state: "ok", remainingMs };
}

export type ProofOfLifeAlertWallet = ProofOfLifeDeadlineSource & {
  /** The wallet identity the alert must carry, so a reminder can name its wallet. */
  unit: string;
  walletName: string;
  /** Whether the connected signer can open the renewal flow for this wallet. */
  canRenew: boolean;
};

export type ProofOfLifeAlert = {
  unit: string;
  walletName: string;
  state: "approaching" | "overdue";
  deadlineMs: number;
  remainingMs: number;
  canRenew: boolean;
};

/**
 * Collect the wallets whose deadline needs attention, overdue ones first, then by the
 * soonest deadline. Wallets with no alert (timer off, or comfortably far out) are left out:
 * an alert list that lists everything is noise, and noise trains the reader to ignore it.
 */
export function selectProofOfLifeAlerts(
  wallets: ProofOfLifeAlertWallet[],
  nowMs: number
): ProofOfLifeAlert[] {
  const alerts: ProofOfLifeAlert[] = [];
  for (const wallet of wallets) {
    const deadlineMs = readProofOfLifeDeadline(wallet);
    if (deadlineMs === null) {
      continue;
    }
    const evaluation = evaluateProofOfLifeAlert({ deadlineMs, nowMs });
    if (evaluation.state === "ok") {
      continue;
    }
    alerts.push({
      unit: wallet.unit,
      walletName: wallet.walletName,
      state: evaluation.state,
      deadlineMs,
      remainingMs: evaluation.remainingMs,
      canRenew: wallet.canRenew
    });
  }
  const stateRank = { overdue: 0, approaching: 1 } as const;
  return alerts.sort(
    (a, b) => stateRank[a.state] - stateRank[b.state] || a.remainingMs - b.remainingMs
  );
}
