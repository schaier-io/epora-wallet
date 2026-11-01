// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const chain = vi.hoisted(() => ({ addressPage: vi.fn() }));
vi.mock("@/lib/stt-cache/chain", () => ({
  createDefaultSttChainClient: () => ({
    fetchAddressTransactionsPage: chain.addressPage,
    fetchCollectionAssets: async () => ({ assets: [], next: null }),
    fetchAddressUTxOs: async () => { throw new Error("Unexpected wallet lookup"); },
    fetchTxInfo: async () => { throw new Error("Unexpected transaction lookup"); }
  })
}));

import { getPrisma } from "@/lib/prisma";
import { STT_CACHE_NETWORK } from "./domain";
import { runSttVisitSync, STT_VISIT_SYNC_COOLDOWN_MS } from "./visit-sync";

// Opt in only against an isolated local schema. Ordinary component tests must
// not connect to a deployment database or make chain requests.
const RUN_POSTGRES_TEST = process.env.STT_VISIT_POSTGRES_TEST === "1";
if (RUN_POSTGRES_TEST) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.searchParams.get("schema") !== "stt_test") {
    throw new Error("Visit sync PostgreSQL tests require a loopback database with schema=stt_test.");
  }
  if (process.env.DATABASE_URL_UNPOOLED &&
      !["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL_UNPOOLED).hostname)) {
    throw new Error("Visit sync PostgreSQL tests require a loopback advisory-lock connection.");
  }
}
describe.skipIf(!RUN_POSTGRES_TEST)("visit sync with PostgreSQL sessions", () => {
  let db: ReturnType<typeof getPrisma>;
  beforeEach(async () => {
    db = getPrisma();
    chain.addressPage.mockReset().mockResolvedValue([]);
    await db.sttSyncCursor.deleteMany({ where: { network: STT_CACHE_NETWORK } });
  });
  afterAll(async () => { await db.$disconnect(); });

  it("allows one concurrent session and persists the cooldown for later sessions", async () => {
    let finish!: () => void;
    let started!: () => void;
    const inProgress = new Promise<void>(resolve => { started = resolve; });
    const pending = new Promise<void>(resolve => { finish = resolve; });
    chain.addressPage.mockImplementationOnce(async () => { started(); await pending; return []; });
    const first = runSttVisitSync();
    await inProgress;
    try {
      expect(await runSttVisitSync()).toEqual({ outcome: "busy", retryAfterMs: STT_VISIT_SYNC_COOLDOWN_MS });
    } finally {
      finish();
    }
    expect(await first).toMatchObject({ outcome: "ran", continuationNeeded: false });
    const chainCalls = chain.addressPage.mock.calls.length;
    expect(await runSttVisitSync()).toMatchObject({ outcome: "skipped" });
    expect(chain.addressPage).toHaveBeenCalledTimes(chainCalls);
    const attempt = await db.sttSyncCursor.findUniqueOrThrow({
      where: { network_cursorKey: { network: STT_CACHE_NETWORK, cursorKey: "visit-attempt" } }
    });
    expect(attempt.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("retains the attempt after a chain failure and releases its session lock", async () => {
    chain.addressPage.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(runSttVisitSync()).rejects.toThrow("provider unavailable");
    expect(await runSttVisitSync()).toMatchObject({ outcome: "skipped" });
    expect(chain.addressPage).toHaveBeenCalledOnce();
  });
});
