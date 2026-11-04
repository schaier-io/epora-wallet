// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

type Cursor = { cursorValue: string | null; stateJson: string | null; lastSyncedAt: Date | null };
type CursorQuery = { where: { network_cursorKey: { cursorKey: string } } };
const boundary = vi.hoisted(() => ({
  cursors: new Map<string, Cursor>(),
  locked: false,
  run: vi.fn(),
  connect: vi.fn(),
  reads: vi.fn(),
  writes: vi.fn()
}));
vi.mock("@/lib/stt-cache/indexer", () => ({ runSttBackgroundSync: boundary.run }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    sttSyncCursor: {
      findUnique: boundary.reads,
      upsert: boundary.writes
    }
  })
}));
vi.mock("pg", () => ({
  Client: class {
    ownsLock = false;
    connect = boundary.connect;
    async query(sql: string) {
      if (sql.includes("pg_try_advisory_lock")) {
        this.ownsLock = !boundary.locked;
        if (this.ownsLock) boundary.locked = true;
        return { rows: [{ acquired: this.ownsLock }] };
      }
      if (this.ownsLock) boundary.locked = false;
      return { rows: [] };
    }
    async end() { if (this.ownsLock) boundary.locked = false; }
  }
}));

import { runSttVisitSync } from "./visit-sync";

const COOLDOWN_MS = 15 * 60_000;
const START_MS = Date.parse("2026-10-30T00:00:00Z");
function completedCursor(completed: boolean): Cursor {
  return { cursorValue: null, stateJson: JSON.stringify({ completed }), lastSyncedAt: new Date(START_MS) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START_MS);
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/wallet");
  vi.stubEnv("DATABASE_URL_UNPOOLED", "");
  boundary.cursors.clear();
  boundary.locked = false;
  boundary.connect.mockReset();
  boundary.reads.mockReset().mockImplementation(async ({ where }: CursorQuery) => boundary.cursors.get(where.network_cursorKey.cursorKey) ?? null);
  boundary.writes.mockReset().mockImplementation(async ({ where, create }: CursorQuery & { create: Cursor }) => {
    boundary.cursors.set(where.network_cursorKey.cursorKey, create);
    return create;
  });
  boundary.run.mockReset().mockImplementation(async () => {
    boundary.cursors.set("history-backfill", completedCursor(true));
    boundary.cursors.set("wallet-reconcile", completedCursor(true));
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("records the attempt before chain work and allows the exact cooldown boundary", async () => {
  boundary.run.mockImplementation(async ({ deadline }: { deadline: number }) => {
    expect(boundary.cursors.get("visit-attempt")?.lastSyncedAt?.getTime()).toBe(Date.now());
    expect(deadline).toBe(Date.now() + 4 * 60_000);
    boundary.cursors.set("history-backfill", completedCursor(true));
    boundary.cursors.set("wallet-reconcile", completedCursor(true));
  });
  expect(await runSttVisitSync()).toEqual({
    outcome: "ran", retryAfterMs: COOLDOWN_MS,
    historyComplete: true, walletReconcileComplete: true, continuationNeeded: false
  });
  vi.setSystemTime(START_MS + COOLDOWN_MS - 1);
  expect(await runSttVisitSync()).toEqual({ outcome: "skipped", retryAfterMs: 1 });
  expect(boundary.run).toHaveBeenCalledTimes(1);
  vi.setSystemTime(START_MS + COOLDOWN_MS);
  expect((await runSttVisitSync()).outcome).toBe("ran");
  expect(boundary.run).toHaveBeenCalledTimes(2);
});

it("lets one concurrent visitor run and shares its cooldown with later visitors", async () => {
  let finish!: () => void;
  let started!: () => void;
  const running = new Promise<void>(resolve => { started = resolve; });
  const pending = new Promise<void>(resolve => { finish = resolve; });
  boundary.run.mockImplementation(async () => { started(); await pending; });
  const first = runSttVisitSync();
  await running;
  expect(await runSttVisitSync()).toEqual({ outcome: "busy", retryAfterMs: COOLDOWN_MS });
  finish();
  await first;
  expect(await runSttVisitSync()).toEqual({ outcome: "skipped", retryAfterMs: COOLDOWN_MS });
  expect(boundary.run).toHaveBeenCalledTimes(1);
});

it("keeps the shared cooldown after a provider failure", async () => {
  boundary.run.mockRejectedValue(new Error("provider unavailable"));
  await expect(runSttVisitSync()).rejects.toThrow("provider unavailable");
  expect(await runSttVisitSync()).toEqual({ outcome: "skipped", retryAfterMs: COOLDOWN_MS });
  expect(boundary.run).toHaveBeenCalledTimes(1);
});

it("reports unfinished cursor work even when the runner did not hit its deadline", async () => {
  boundary.run.mockResolvedValue({ historyBackfill: { deadlineReached: false }, walletReconcile: { deadlineReached: false } });
  boundary.cursors.set("history-backfill", completedCursor(false));
  boundary.cursors.set("wallet-reconcile", completedCursor(true));
  expect(await runSttVisitSync()).toMatchObject({
    outcome: "ran", historyComplete: false, walletReconcileComplete: true, continuationNeeded: true
  });
});

it("never treats a missing reconcile completion marker as complete", async () => {
  boundary.run.mockResolvedValue(undefined);
  boundary.cursors.set("history-backfill", completedCursor(true));
  boundary.cursors.set("wallet-reconcile", { cursorValue: null, stateJson: "{}", lastSyncedAt: new Date(START_MS) });
  expect(await runSttVisitSync()).toMatchObject({ outcome: "ran", walletReconcileComplete: false, continuationNeeded: true });
});
