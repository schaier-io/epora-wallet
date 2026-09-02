import assert from "node:assert/strict";
import test from "node:test";

import {
  STREAMING_PAYOUT_COOLDOWN_MINUTES,
  deriveStreamingPayoutCooldown,
  deriveStreamingPaymentRowStatus
} from "./streaming-payment-status";

const MINUTE_MS = 60_000;
const NOW = 1_760_000_000_000;

function rowStatus(overrides: Partial<Parameters<typeof deriveStreamingPaymentRowStatus>[0]> = {}) {
  return deriveStreamingPaymentRowStatus({
    cleanupRequired: false,
    startDateMs: NOW - 10 * MINUTE_MS,
    endDateMs: NOW + 10 * MINUTE_MS,
    nowMs: NOW,
    ...overrides
  });
}

test("a fully settled payment is finished, whatever its dates say", () => {
  assert.deepEqual(
    rowStatus({ cleanupRequired: true, startDateMs: NOW + MINUTE_MS }),
    { kind: "finished" }
  );
});

test("a payment past its end date with something still owed has ended", () => {
  assert.deepEqual(rowStatus({ endDateMs: NOW - MINUTE_MS }), {
    kind: "ended",
    endDateMs: NOW - MINUTE_MS
  });
});

test("the end-date boundary counts as ended", () => {
  assert.equal(rowStatus({ endDateMs: NOW }).kind, "ended");
});

test("a payment that has not started yet is upcoming", () => {
  assert.deepEqual(rowStatus({ startDateMs: NOW + MINUTE_MS }), {
    kind: "upcoming",
    startDateMs: NOW + MINUTE_MS
  });
});

test("the start-date boundary counts as active, not upcoming", () => {
  assert.equal(rowStatus({ startDateMs: NOW }).kind, "active");
});

test("a payment inside its run is active", () => {
  assert.deepEqual(rowStatus(), { kind: "active" });
});

test("a zero end date (unset or malformed) reads as ended, never active", () => {
  assert.equal(rowStatus({ startDateMs: 0, endDateMs: 0 }).kind, "ended");
});

function cooldown(
  overrides: Partial<Parameters<typeof deriveStreamingPayoutCooldown>[0]> = {}
) {
  return deriveStreamingPayoutCooldown({
    lastNonAdminPayoutAtMs: null,
    authorityPath: "user",
    txEarliestTimeMs: NOW,
    nowMs: NOW,
    ...overrides
  });
}

test("a wallet that never paid out is not on cooldown", () => {
  assert.deepEqual(cooldown(), { blocked: false, remainingMinutes: 0, retryAtMs: NOW });
});

test("a payout ten minutes ago blocks for twenty more, naming the retry time", () => {
  const lastNonAdminPayoutAtMs = NOW - 10 * MINUTE_MS;
  assert.deepEqual(
    cooldown({ lastNonAdminPayoutAtMs, txEarliestTimeMs: NOW, nowMs: NOW }),
    {
      blocked: true,
      remainingMinutes: 20,
      retryAtMs: lastNonAdminPayoutAtMs + 30 * MINUTE_MS
    }
  );
});

test("part minutes round up so the copy never promises too much", () => {
  // One millisecond past ten minutes ago leaves 20 minutes plus 1 ms.
  const lastNonAdminPayoutAtMs = NOW - 10 * MINUTE_MS + 1;
  assert.equal(
    cooldown({ lastNonAdminPayoutAtMs, txEarliestTimeMs: NOW, nowMs: NOW }).remainingMinutes,
    21
  );
});

test("a payout older than the cooldown leaves the wallet free to pay", () => {
  assert.equal(
    cooldown({ lastNonAdminPayoutAtMs: NOW - 31 * MINUTE_MS, nowMs: NOW }).blocked,
    false
  );
});

test("the admin authority path bypasses the cooldown", () => {
  assert.equal(
    cooldown({
      lastNonAdminPayoutAtMs: NOW - MINUTE_MS,
      authorityPath: "admin",
      nowMs: NOW
    }).blocked,
    false
  );
});

test("the copy's cooldown window matches the on-chain 30-minute cadence", () => {
  assert.equal(STREAMING_PAYOUT_COOLDOWN_MINUTES, 30);
});
