import assert from "node:assert/strict";
import test from "node:test";
import { describeProofOfLife } from "@/lib/user-flow/proof-of-life";

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
  const summary = describeProofOfLife(
    { proofOfLifeUnlockTimeMode: "none", proofOfLifeUnlockTime: "" },
    NOW
  );

  assert.equal(summary.value, null);
  assert.equal(summary.emptyLabel, "proof of life");
  assert.equal(summary.cta, "Set up proof of life");
  assert.equal(summary.urgent, false);
});

test("a mode of some with no usable timestamp is still treated as off", () => {
  // The form can hold `some` with an empty or half-typed value while the user edits.
  for (const raw of ["", "0", "not-a-date"]) {
    const summary = describeProofOfLife(
      { proofOfLifeUnlockTimeMode: "some", proofOfLifeUnlockTime: raw },
      NOW
    );
    assert.equal(summary.value, null, `expected "${raw}" to read as off`);
  }
});

test("a distant deadline counts down in days and is not urgent", () => {
  const summary = describeProofOfLife(armed(NOW + 103 * DAY), NOW);

  assert.equal(summary.value, "103 days");
  assert.equal(summary.label, "to check in");
  assert.equal(summary.urgent, false);
});

test("a deadline inside a week is urgent", () => {
  assert.equal(describeProofOfLife(armed(NOW + 6 * DAY), NOW).urgent, true);
  assert.equal(describeProofOfLife(armed(NOW + 8 * DAY), NOW).urgent, false);
});

test("the last two days count down in hours, with a real singular", () => {
  assert.equal(describeProofOfLife(armed(NOW + 30 * HOUR), NOW).value, "30 hours");
  assert.equal(describeProofOfLife(armed(NOW + HOUR), NOW).value, "1 hour");
  assert.equal(describeProofOfLife(armed(NOW + 60 * 1000), NOW).value, "< 1 hour");
});

test("a lapsed timer says it ran out and offers a renewal, not a countdown", () => {
  const summary = describeProofOfLife(armed(NOW - DAY), NOW);

  assert.equal(summary.value, "Ran out");
  assert.doesNotMatch(summary.value, /-/);
  assert.equal(summary.cta, "Check in now");
  assert.equal(summary.urgent, true);
});
