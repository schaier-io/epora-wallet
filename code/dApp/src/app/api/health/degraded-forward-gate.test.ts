import assert from "node:assert/strict";
import test from "node:test";
import type { HealthResponse } from "@/lib/api/health";
import {
  HEALTH_DEGRADED_FORWARD_COOLDOWN_MS,
  createDegradedForwardGate,
  degradedSignature,
  shouldForward,
  type DegradedForwardRecord,
  type HealthProbeFailure
} from "./degraded-forward-gate";

const SIG_A = "db=down,indexer=unknown,reasons=";
const SIG_B = "db=up,indexer=down,reasons=indexer: sync-cursor read failed";

// --- shouldForward: the pure decision ---

test("shouldForward: first failure (null previous) forwards", () => {
  assert.equal(shouldForward(null, SIG_A, 1_000, 300_000), true);
});

test("shouldForward: first failure (undefined previous) forwards", () => {
  assert.equal(shouldForward(undefined, SIG_A, 1_000, 300_000), true);
});

test("shouldForward: identical signature inside the cooldown is suppressed", () => {
  const previous: DegradedForwardRecord = { signature: SIG_A, forwardedAtMs: 1_000 };
  assert.equal(shouldForward(previous, SIG_A, 1_000 + 300_000 - 1, 300_000), false);
});

test("shouldForward: identical signature after the cooldown forwards again", () => {
  const previous: DegradedForwardRecord = { signature: SIG_A, forwardedAtMs: 1_000 };
  assert.equal(shouldForward(previous, SIG_A, 1_000 + 300_000, 300_000), true);
  assert.equal(shouldForward(previous, SIG_A, 1_000 + 300_000 + 1, 300_000), true);
});

test("shouldForward: changed signature forwards immediately, even inside the cooldown", () => {
  const previous: DegradedForwardRecord = { signature: SIG_A, forwardedAtMs: 1_000 };
  assert.equal(shouldForward(previous, SIG_B, 1_000, 300_000), true);
});

test("shouldForward: suppressed repeats do not extend the cooldown", () => {
  // The record keeps the forward time, so polling during suppression cannot
  // push the re-announcement further out.
  const previous: DegradedForwardRecord = { signature: SIG_A, forwardedAtMs: 1_000 };
  assert.equal(shouldForward(previous, SIG_A, 300_999, 300_000), false);
  assert.equal(shouldForward(previous, SIG_A, 301_000, 300_000), true);
});

// --- degradedSignature: stable identity of a degraded state ---

function dbDownBody(ts: string): HealthResponse {
  return {
    status: "degraded",
    checks: { database: "down", indexer: "unknown" },
    indexer: null,
    ts
  };
}

function readFailedBody(ts: string): HealthResponse {
  return {
    status: "degraded",
    checks: { database: "up", indexer: "down" },
    indexer: {
      available: false,
      recentHeadLastSyncedAt: null,
      recentHeadAgeMs: null,
      recentHeadFresh: false,
      walletReconcileLastSyncedAt: null,
      walletReconcileAgeMs: null,
      walletReconcileFresh: false,
      historyBackfillCompleted: false,
      degradedReasons: ["indexer: sync-cursor read failed"]
    },
    ts
  };
}

function staleCursorsBody(ageMs1: number, ageMs2: number, ts: string): HealthResponse {
  return {
    status: "degraded",
    checks: { database: "up", indexer: "down" },
    indexer: {
      available: true,
      recentHeadLastSyncedAt: "2026-09-17T23:00:00.000Z",
      recentHeadAgeMs: ageMs1,
      recentHeadFresh: false,
      walletReconcileLastSyncedAt: "2026-09-17T22:00:00.000Z",
      walletReconcileAgeMs: ageMs2,
      walletReconcileFresh: false,
      historyBackfillCompleted: true,
      degradedReasons: [
        `recent-head: stale (ageMs=${ageMs1} > staleAfterMs=1800000)`,
        `wallet-reconcile: stale (ageMs=${ageMs2} > staleAfterMs=3600000)`
      ]
    },
    ts
  };
}

test("degradedSignature: identical failures agree despite changing ts and cursor ages", () => {
  // One ongoing stall: the cursor ages grow and ts moves on every probe, but
  // the state is the same, so the signature must not move.
  assert.equal(degradedSignature(staleCursorsBody(1_800_001, 3_600_001, "T1")), degradedSignature(staleCursorsBody(1_830_000, 3_630_000, "T2")));
});

test("degradedSignature: strips the volatile age detail from stale reasons", () => {
  assert.equal(degradedSignature(staleCursorsBody(5, 9, "T")).includes("ageMs"), false);
});

test("degradedSignature: distinguishes the degraded states the route can report", () => {
  const signatures = new Set([
    degradedSignature(dbDownBody("T")),
    degradedSignature(readFailedBody("T")),
    degradedSignature(staleCursorsBody(5, 9, "T"))
  ]);
  assert.equal(signatures.size, 3);
});

// --- createDegradedForwardGate: the stateful wrapper ---

type GateHarness = ReturnType<typeof makeGate>;

function makeGate(): {
  gate: ReturnType<typeof createDegradedForwardGate>;
  forwarded: HealthProbeFailure[];
  suppressed: HealthProbeFailure[];
} {
  const forwarded: HealthProbeFailure[] = [];
  const suppressed: HealthProbeFailure[] = [];
  const gate = createDegradedForwardGate(
    {
      forward: (failure) => forwarded.push(failure),
      suppress: (failure) => suppressed.push(failure)
    },
    HEALTH_DEGRADED_FORWARD_COOLDOWN_MS
  );
  return { gate, forwarded, suppressed };
}

const DB_DOWN_FAILURE: HealthProbeFailure = { event: "health.db_probe_failed", error: new Error("db down") };

function observeDbDown(harness: GateHarness, nowMs: number): void {
  harness.gate.observe(dbDownBody(`T${nowMs}`), nowMs, [DB_DOWN_FAILURE]);
}

test("gate: the first degraded response forwards each probe failure", () => {
  const harness = makeGate();
  observeDbDown(harness, 1_000);
  assert.deepEqual(harness.forwarded, [DB_DOWN_FAILURE]);
  assert.deepEqual(harness.suppressed, []);
});

test("gate: identical degraded responses inside the cooldown are suppressed locally", () => {
  const harness = makeGate();
  observeDbDown(harness, 1_000);
  observeDbDown(harness, 31_000);
  observeDbDown(harness, 61_000);
  assert.equal(harness.forwarded.length, 1);
  assert.deepEqual(harness.suppressed, [DB_DOWN_FAILURE, DB_DOWN_FAILURE]);
});

test("gate: identical degraded responses after the cooldown forward again", () => {
  const harness = makeGate();
  observeDbDown(harness, 1_000);
  observeDbDown(harness, 61_000);
  observeDbDown(harness, 1_000 + HEALTH_DEGRADED_FORWARD_COOLDOWN_MS);
  assert.equal(harness.forwarded.length, 2);
});

test("gate: a changed signature forwards immediately", () => {
  const harness = makeGate();
  observeDbDown(harness, 1_000);
  // Database recovered but the cursor read now fails: a different state.
  harness.gate.observe(readFailedBody("T2"), 2_000, [
    { event: "health.indexer_probe_failed", error: new Error("read failed") }
  ]);
  assert.equal(harness.forwarded.length, 2);
  assert.deepEqual(harness.suppressed, []);
});

test("gate: a healthy response closes the incident, so the next outage forwards again", () => {
  const harness = makeGate();
  observeDbDown(harness, 1_000);
  harness.gate.observe(
    { status: "ok", checks: { database: "up", indexer: "up" }, indexer: null, ts: "T2" },
    2_000,
    []
  );
  observeDbDown(harness, 3_000);
  assert.equal(harness.forwarded.length, 2);
});

test("gate: a failureless degradation (stale cursors) emits nothing but updates the state", () => {
  const harness = makeGate();
  observeDbDown(harness, 1_000);
  // Cursors went stale while the read itself succeeds: no probe failure, so
  // nothing is logged, exactly as before. The state change is still recorded,
  // which is what keeps the next database failure from being swallowed.
  harness.gate.observe(staleCursorsBody(5, 9, "T2"), 2_000, []);
  assert.deepEqual(harness.forwarded, [DB_DOWN_FAILURE]);
  assert.deepEqual(harness.suppressed, []);
  observeDbDown(harness, 3_000);
  assert.equal(harness.forwarded.length, 2);
});

test("gate: a failureless degradation still emits nothing while unchanged", () => {
  const harness = makeGate();
  harness.gate.observe(staleCursorsBody(5, 9, "T1"), 1_000, []);
  harness.gate.observe(staleCursorsBody(35, 39, "T2"), 31_000, []);
  assert.deepEqual(harness.forwarded, []);
  assert.deepEqual(harness.suppressed, []);
});
