// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HealthResponseSchema, ReadinessResponseSchema } from "@/lib/api/health";

const boundary = vi.hoisted(() => ({
  getPrisma: vi.fn(),
  queryRaw: vi.fn(),
  findCursor: vi.fn<(query: { where: { network_cursorKey: { cursorKey: string } } }) => Promise<unknown>>(),
  error: vi.fn(),
  info: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: boundary.getPrisma }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: boundary.error, info: boundary.info },
  serializeError: (error: unknown) => error
}));

import { GET } from "./route";
import { GET as getReady } from "./ready/route";

const NOW = new Date("2026-10-30T00:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  boundary.getPrisma.mockReturnValue({
    $queryRaw: boundary.queryRaw,
    sttSyncCursor: { findUnique: boundary.findCursor }
  });
  boundary.queryRaw.mockResolvedValue([{ ready: 1 }]);
  boundary.findCursor.mockResolvedValue({
    cursorValue: null,
    stateJson: JSON.stringify({ completed: true }),
    lastSyncedAt: NOW
  });
});

afterEach(() => vi.useRealTimers());

describe("GET /api/health", () => {
  it("stays live without accessing Prisma even when the database is unavailable", async () => {
    boundary.getPrisma.mockImplementation(() => { throw new Error("Database must remain asleep"); });

    for (let request = 0; request < 2; request += 1) {
      const response = await GET();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body: unknown = await response.json();
      expect(HealthResponseSchema.parse(body)).toEqual({ status: "ok", ts: NOW.toISOString() });
      expect(body).not.toHaveProperty("checks");
    }
    expect(boundary.getPrisma).not.toHaveBeenCalled();
    expect(boundary.queryRaw).not.toHaveBeenCalled();
    expect(boundary.findCursor).not.toHaveBeenCalled();
  });
});

describe("GET /api/health/ready", () => {
  it("still probes the database and all three sync cursors on demand", async () => {
    const response = await getReady();
    const body = ReadinessResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.checks).toEqual({ database: "up", indexer: "up" });
    expect(body.indexer?.historyBackfillCompleted).toBe(true);
    expect(boundary.queryRaw).toHaveBeenCalledOnce();
    expect(boundary.queryRaw.mock.calls[0]?.[0]).toEqual(["SELECT 1"]);
    expect(boundary.findCursor.mock.calls.map(([query]) => query.where.network_cursorKey.cursorKey).sort())
      .toEqual(["history-backfill", "recent-head", "wallet-reconcile"]);
  });

  it("reports stale cached data without changing application liveness", async () => {
    boundary.findCursor.mockResolvedValue({ cursorValue: null, stateJson: null, lastSyncedAt: new Date(0) });

    const response = await getReady();
    const body = ReadinessResponseSchema.parse(await response.json());
    expect(response.status).toBe(503);
    expect(body.checks).toEqual({ database: "up", indexer: "down" });
    expect(body.indexer?.degradedReasons).toHaveLength(2);
    expect((await GET()).status).toBe(200);
  });

  it("skips cursor reads after a failed database probe and retains failure flood control", async () => {
    // A healthy observation closes any incident left by another route test.
    await getReady();
    vi.clearAllMocks();
    boundary.queryRaw.mockRejectedValue(new Error("Database unavailable"));

    for (let request = 0; request < 2; request += 1) {
      const response = await getReady();
      expect(response.status).toBe(503);
      expect(ReadinessResponseSchema.parse(await response.json())).toMatchObject({
        status: "degraded", checks: { database: "down", indexer: "unknown" }, indexer: null
      });
    }
    expect(boundary.findCursor).not.toHaveBeenCalled();
    expect(boundary.error).toHaveBeenCalledOnce();
    expect(boundary.info).toHaveBeenCalledOnce();
  });
});
