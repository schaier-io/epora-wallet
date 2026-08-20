import assert from "node:assert/strict";
import test from "node:test";
import { describeWakeUpTimer } from "@/lib/user-flow/wake-up-timer";

const NOW = 1_760_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function armed(unlockMs: number) {
  return {
    proofOfLifeUnlockTimeMode: "some" as const,
    proofOfLifeUnlockTime: String(unlockMs)
  };
}

test("an unarmed timer reads as absent rather than as zero time left", () => {
  const summary = describeWakeUpTimer(
    { proofOfLifeUnlockTimeMode: "none", proofOfLifeUnlockTime: "" },
    NOW
  );

  assert.equal(summary.value, null);
  assert.equal(summary.emptyLabel, "wake-up timer");
  assert.equal(summary.urgent, false);
});

test("a mode of some with no usable timestamp is still treated as off", () => {
  // The form can hold `some` with an empty or half-typed value while the user edits.
  for (const raw of ["", "0", "not-a-date"]) {
    const summary = describeWakeUpTimer(
      { proofOfLifeUnlockTimeMode: "some", proofOfLifeUnlockTime: raw },
      NOW
    );
    assert.equal(summary.value, null, `expected "${raw}" to read as off`);
  }
});

test("a distant deadline counts down in days and is not urgent", () => {
  const summary = describeWakeUpTimer(armed(NOW + 103 * DAY), NOW);

  assert.equal(summary.value, "103 days");
  assert.equal(summary.label, "left on the timer");
  assert.equal(summary.urgent, false);
});

test("a deadline inside a week is urgent", () => {
  assert.equal(describeWakeUpTimer(armed(NOW + 6 * DAY), NOW).urgent, true);
  assert.equal(describeWakeUpTimer(armed(NOW + 8 * DAY), NOW).urgent, false);
});

test("the last two days count down in hours, with a real singular", () => {
  assert.equal(describeWakeUpTimer(armed(NOW + 30 * HOUR), NOW).value, "30 hours");
  assert.equal(describeWakeUpTimer(armed(NOW + HOUR), NOW).value, "1 hour");
  assert.equal(describeWakeUpTimer(armed(NOW + 60 * 1000), NOW).value, "< 1 hour");
});

test("a lapsed timer says it ran out and offers a renewal, not a countdown", () => {
  const summary = describeWakeUpTimer(armed(NOW - DAY), NOW);

  assert.equal(summary.value, "Ran out");
  assert.doesNotMatch(summary.value, /-/);
  assert.equal(summary.cta, "Renew the timer");
  assert.equal(summary.urgent, true);
});
