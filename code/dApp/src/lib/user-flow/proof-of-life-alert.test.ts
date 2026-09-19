import assert from "node:assert/strict";
import test from "node:test";
import {
  PROOF_OF_LIFE_ALERT_THRESHOLD_MS,
  evaluateProofOfLifeAlert,
  readProofOfLifeDeadline,
  selectProofOfLifeAlerts
} from "@/lib/user-flow/proof-of-life-alert";

const NOW = 1_760_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const THRESHOLD = 7 * DAY;

function armed(unlockMs: number) {
  return {
    proofOfLifeUnlockTimeMode: "some" as const,
    proofOfLifeUnlockTime: String(unlockMs)
  };
}

test("a deadline just inside the threshold is approaching", () => {
  const evaluation = evaluateProofOfLifeAlert({ deadlineMs: NOW + THRESHOLD - 1, nowMs: NOW });

  assert.deepEqual(evaluation, { state: "approaching", remainingMs: THRESHOLD - 1 });
});

test("a deadline exactly at the threshold counts as approaching, not ok", () => {
  // The boundary belongs to the alarm: "exactly one week left" must still warn, or a
  // deadline that lands precisely on the cutoff passes silently.
  const evaluation = evaluateProofOfLifeAlert({ deadlineMs: NOW + THRESHOLD, nowMs: NOW });

  assert.deepEqual(evaluation, { state: "approaching", remainingMs: THRESHOLD });
});

test("a deadline just past the threshold is ok", () => {
  const evaluation = evaluateProofOfLifeAlert({ deadlineMs: NOW + THRESHOLD + 1, nowMs: NOW });

  assert.deepEqual(evaluation, { state: "ok", remainingMs: THRESHOLD + 1 });
});

test("a deadline exactly now is overdue, with zero remaining", () => {
  const evaluation = evaluateProofOfLifeAlert({ deadlineMs: NOW, nowMs: NOW });

  assert.deepEqual(evaluation, { state: "overdue", remainingMs: 0 });
});

test("a deadline one millisecond in the past is overdue", () => {
  const evaluation = evaluateProofOfLifeAlert({ deadlineMs: NOW - 1, nowMs: NOW });

  assert.deepEqual(evaluation, { state: "overdue", remainingMs: -1 });
});

test("a long-lapsed deadline stays overdue until it is renewed", () => {
  // Deliberate, not alarm fatigue: a lapsed proof of life means recovery contacts can
  // already claim the wallet, so the alert must persist rather than fade after a week.
  const evaluation = evaluateProofOfLifeAlert({ deadlineMs: NOW - 400 * DAY, nowMs: NOW });

  assert.equal(evaluation.state, "overdue");
});

test("a missing deadline reads as ok and never as overdue", () => {
  const evaluation = evaluateProofOfLifeAlert({ deadlineMs: null, nowMs: NOW });

  assert.deepEqual(evaluation, { state: "ok", remainingMs: 0 });
});

test("readProofOfLifeDeadline treats every unarmed or unusable form value as no deadline", () => {
  // The form can hold `none`, an empty string, a negative draft, or half-typed text while
  // the user edits; none of these is a deadline. (`0` is deliberately absent here: it is a
  // real lapsed deadline, not an unarmed value. See the Some(0) tests below.)
  const cases = [
    { proofOfLifeUnlockTimeMode: "none" as const, proofOfLifeUnlockTime: "" },
    { proofOfLifeUnlockTimeMode: "none" as const, proofOfLifeUnlockTime: String(NOW) },
    { proofOfLifeUnlockTimeMode: "some" as const, proofOfLifeUnlockTime: "" },
    { proofOfLifeUnlockTimeMode: "some" as const, proofOfLifeUnlockTime: "   " },
    { proofOfLifeUnlockTimeMode: "some" as const, proofOfLifeUnlockTime: "-5" },
    { proofOfLifeUnlockTimeMode: "some" as const, proofOfLifeUnlockTime: "not-a-date" }
  ];
  for (const form of cases) {
    assert.equal(readProofOfLifeDeadline(form), null, JSON.stringify(form));
  }
});

test("an unlock_time of Some(0) is a real, already-lapsed deadline and stays armed", () => {
  // The contract permits `unlock_time = Some(0)` and treats it as already reached
  // (`lib/state/proof_of_life.ak` documents it as an already-lapsed value that makes
  // beneficiaries immediately unlockable), so a wallet minted that way is the exact state
  // these alerts exist to warn about, not an unarmed one.
  const form = { proofOfLifeUnlockTimeMode: "some" as const, proofOfLifeUnlockTime: "0" };

  assert.equal(readProofOfLifeDeadline(form), 0);
  assert.deepEqual(evaluateProofOfLifeAlert({ deadlineMs: 0, nowMs: NOW }), {
    state: "overdue",
    remainingMs: -NOW
  });
});

test("selectProofOfLifeAlerts warns about a Some(0) wallet as overdue, first", () => {
  const alerts = selectProofOfLifeAlerts(
    [
      { unit: "unit-zero", walletName: "Lapsed at mint", ...armed(0), canRenew: true },
      { unit: "unit-late", walletName: "Ran out", ...armed(NOW - DAY), canRenew: false }
    ],
    NOW
  );

  assert.deepEqual(
    alerts.map((alert) => [alert.unit, alert.state]),
    [
      ["unit-zero", "overdue"],
      ["unit-late", "overdue"]
    ]
  );
  assert.equal(alerts[0].deadlineMs, 0);
});

test("readProofOfLifeDeadline passes an armed timestamp through as a number", () => {
  assert.equal(readProofOfLifeDeadline(armed(NOW)), NOW);
});

test("clock skew past the deadline flips straight to overdue, not to a large negative approaching", () => {
  // A device clock a day fast must not show "approaching" for a wallet that recovery
  // contacts can already claim.
  const evaluation = evaluateProofOfLifeAlert({ deadlineMs: NOW - DAY, nowMs: NOW });

  assert.equal(evaluation.state, "overdue");
});

test("selectProofOfLifeAlerts keeps only wallets with an active alert and carries their identity", () => {
  const alerts = selectProofOfLifeAlerts(
    [
      {
        unit: "unit-far",
        walletName: "Far out",
        ...armed(NOW + 60 * DAY),
        canRenew: true
      },
      {
        unit: "unit-off",
        walletName: "Timer off",
        ...{ proofOfLifeUnlockTimeMode: "none" as const, proofOfLifeUnlockTime: "" },
        canRenew: false
      },
      {
        unit: "unit-soon",
        walletName: "Due soon",
        ...armed(NOW + 2 * DAY),
        canRenew: true
      },
      {
        unit: "unit-late",
        walletName: "Ran out",
        ...armed(NOW - DAY),
        canRenew: false
      }
    ],
    NOW
  );

  assert.deepEqual(
    alerts.map((alert) => [alert.unit, alert.state, alert.canRenew]),
    [
      ["unit-late", "overdue", false],
      ["unit-soon", "approaching", true]
    ]
  );
  assert.equal(alerts[1].deadlineMs, NOW + 2 * DAY);
  assert.equal(alerts[1].remainingMs, 2 * DAY);
});

test("selectProofOfLifeAlerts orders overdue first, then by soonest deadline", () => {
  const alerts = selectProofOfLifeAlerts(
    [
      { unit: "a", walletName: "A", ...armed(NOW + 5 * DAY), canRenew: true },
      { unit: "b", walletName: "B", ...armed(NOW + 1 * HOUR), canRenew: true },
      { unit: "c", walletName: "C", ...armed(NOW - 2 * DAY), canRenew: true },
      { unit: "d", walletName: "D", ...armed(NOW - DAY), canRenew: true }
    ],
    NOW
  );

  // Longest-lapsed first within overdue (the wallet recovery contacts could claim for the
  // longest time), then the approaching ones by the least time left.
  assert.deepEqual(
    alerts.map((alert) => alert.unit),
    ["c", "d", "b", "a"]
  );
});

test("the threshold is one week", () => {
  assert.equal(PROOF_OF_LIFE_ALERT_THRESHOLD_MS, THRESHOLD);
});
