import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import type { PrismaClient } from "@/generated/prisma";
import { lookupSttWallets } from "@/lib/stt-cache/lookup";
import { reconcileCurrentWallets, syncRecentHead } from "@/lib/stt-cache/indexer";
import {
  TEST_CONNECTED_ADDRESS,
  TEST_CONNECTED_PAYMENT_KEY_HASH,
  createMockChainClient,
  createTestDatabaseClient,
  resetTestDatabase
} from "@/lib/stt-cache/test-helpers";
import { HealthResponseSchema } from "@/lib/api/health";
import { PoolsResponseSchema } from "@/lib/api/pools";
import { SttLookupRequestSchema, SttLookupResponseSchema } from "@/lib/api/stt-lookup";

// Generation makes the document's schemas the routes' schemas. It cannot check
// that what a handler actually produces matches the schema it claims, because
// it never runs one. These tests do: real data layer, real schema, and a parse
// failure is a test failure. No second validator, because the schema IS the
// contract the spec publishes.

const DB_SKIP = process.env.DATABASE_URL
  ? false
  : "DATABASE_URL not set — run via `pnpm test`";

describe("stt lookup conformance", { skip: DB_SKIP }, () => {
  let db: PrismaClient;

  before(async () => {
    db = await createTestDatabaseClient();
  });

  beforeEach(async () => {
    await resetTestDatabase(db);
    const chainClient = createMockChainClient();
    await syncRecentHead({ db, chainClient });
    await reconcileCurrentWallets({ db, chainClient });
  });

  after(async () => {
    await db.$disconnect();
  });

  test("a populated response matches the schema the spec publishes", async () => {
    const result = await lookupSttWallets(
      { address: TEST_CONNECTED_ADDRESS, txLimit: 5 },
      { db }
    );

    // Assert the fixture actually produced a wallet first. Parsing an empty
    // list would pass while exercising almost none of the schema.
    assert.equal(result.wallets.length, 1);
    assert.ok(result.wallets[0]!.recentTransactions.length > 0);

    const parsed = SttLookupResponseSchema.safeParse(result);
    assert.ok(
      parsed.success,
      `response does not match SttLookupResponseSchema: ${JSON.stringify(parsed.error?.issues)}`
    );
  });

  test("the payment-key-hash query matches the schema too", async () => {
    const result = await lookupSttWallets(
      { paymentKeyHash: TEST_CONNECTED_PAYMENT_KEY_HASH },
      { db }
    );

    assert.equal(result.wallets.length, 1);
    const parsed = SttLookupResponseSchema.safeParse(result);
    assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  });

  test("an empty result still matches the schema", async () => {
    const result = await lookupSttWallets({ paymentKeyHash: "ab".repeat(28) }, { db });

    assert.deepEqual(result.wallets, []);
    assert.equal(result.nextCursor, null);
    const parsed = SttLookupResponseSchema.safeParse(result);
    assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  });

  test("a cursor past the last wallet returns an empty page that still parses", async () => {
    const first = await lookupSttWallets({ address: TEST_CONNECTED_ADDRESS }, { db });
    const second = await lookupSttWallets(
      { address: TEST_CONNECTED_ADDRESS, cursor: first.wallets[0]!.id },
      { db }
    );

    assert.deepEqual(second.wallets, []);
    assert.ok(SttLookupResponseSchema.safeParse(second).success);
  });
});

// The unhappy paths the spec documents. These are the request schema's job, so
// they need no database.
describe("stt lookup request rules", () => {
  test("rejects giving both paymentKeyHash and address", () => {
    const result = SttLookupRequestSchema.safeParse({
      address: TEST_CONNECTED_ADDRESS,
      paymentKeyHash: "ab".repeat(28)
    });

    assert.equal(result.success, false);
    assert.equal(
      result.error?.issues[0]?.message,
      "Exactly one of paymentKeyHash or address must be provided."
    );
  });

  test("rejects giving neither", () => {
    const result = SttLookupRequestSchema.safeParse({});

    assert.equal(result.success, false);
    assert.equal(
      result.error?.issues[0]?.message,
      "Exactly one of paymentKeyHash or address must be provided."
    );
  });

  test("rejects a txLimit above the documented maximum", () => {
    assert.equal(
      SttLookupRequestSchema.safeParse({
        address: TEST_CONNECTED_ADDRESS,
        txLimit: 51
      }).success,
      false
    );
  });
});

describe("health conformance", () => {
  // The handler builds one of exactly two bodies. Both are asserted here
  // because the spec documents both, and only one is ever seen in practice.
  test("both documented bodies match the schema", () => {
    for (const body of [
      { status: "ok", checks: { database: "up" }, ts: new Date().toISOString() },
      { status: "degraded", checks: { database: "down" }, ts: new Date().toISOString() }
    ]) {
      const parsed = HealthResponseSchema.safeParse(body);
      assert.ok(parsed.success, `${JSON.stringify(body)}: ${JSON.stringify(parsed.error?.issues)}`);
    }
  });

  test("rejects a status the spec does not document", () => {
    assert.equal(
      HealthResponseSchema.safeParse({
        status: "fine",
        checks: { database: "up" },
        ts: new Date().toISOString()
      }).success,
      false
    );
  });
});

describe("pools conformance", () => {
  // Every optional field of a pool is nullable, because Blockfrost returns a
  // pool with no registered metadata. A schema that required any of them would
  // reject a real response, so assert the all-null case explicitly.
  test("a pool with no metadata matches the schema", () => {
    const parsed = PoolsResponseSchema.safeParse({
      pool: {
        poolId: "pool16qm84296j6csnrx553kdq5nkv7r6qf5sam2n0xrturasyxf7rmq",
        ticker: null,
        name: null,
        homepage: null,
        description: null,
        saturation: null,
        liveStakeLovelace: null,
        activeStakeLovelace: null,
        declaredPledgeLovelace: null,
        livePledgeLovelace: null,
        marginPct: null,
        fixedCostLovelace: null,
        blocksMinted: null,
        retiring: false
      }
    });

    assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  });

  test("a fully populated pool matches the schema", () => {
    const parsed = PoolsResponseSchema.safeParse({
      pool: {
        poolId: "pool1rkfs9glmfva3jd0q9vnlqvuhnrflpzj4l07u6sayfx5k7d788us",
        ticker: "ATADA",
        name: "ATADA Austria - PreProd Pool #1",
        homepage: "https://github.com/gitmachtl/scripts",
        description: "Testnet Pool on the PreProd-Chain",
        saturation: 0.008132773900218358,
        liveStakeLovelace: "521320081077",
        activeStakeLovelace: "520124716458",
        declaredPledgeLovelace: "0",
        livePledgeLovelace: "0",
        marginPct: 0.1,
        fixedCostLovelace: "170000000",
        blocksMinted: 41714,
        retiring: false
      }
    });

    assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  });

  // Lovelace stays a decimal string because these values exceed the safe
  // integer range. A number would silently lose precision.
  test("rejects a lovelace amount sent as a number", () => {
    assert.equal(
      PoolsResponseSchema.safeParse({
        pool: {
          poolId: "pool1rkfs9glmfva3jd0q9vnlqvuhnrflpzj4l07u6sayfx5k7d788us",
          ticker: null, name: null, homepage: null, description: null,
          saturation: null, liveStakeLovelace: 521320081077,
          activeStakeLovelace: null, declaredPledgeLovelace: null,
          livePledgeLovelace: null, marginPct: null, fixedCostLovelace: null,
          blocksMinted: null, retiring: false
        }
      }).success,
      false
    );
  });
});
