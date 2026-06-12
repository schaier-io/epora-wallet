import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { PrismaClient } from "@/generated/prisma";
import { lookupSttWallets } from "@/lib/stt-cache/lookup";
import { reconcileCurrentWallets, syncRecentHead } from "@/lib/stt-cache/indexer";
import {
  TEST_CONNECTED_ADDRESS,
  TEST_CONNECTED_PAYMENT_KEY_HASH,
  createMockChainClient,
  createSttFixture,
  createTestDatabaseClient,
  resetTestDatabase
} from "@/lib/stt-cache/test-helpers";

let db: PrismaClient;

before(async () => {
  db = await createTestDatabaseClient();
});

beforeEach(async () => {
  await resetTestDatabase(db);
});

after(async () => {
  await db.$disconnect();
});

test("syncRecentHead and reconcileCurrentWallets are idempotent with Prisma upserts", async () => {
  const chainClient = createMockChainClient();

  await syncRecentHead({ db, chainClient });
  await reconcileCurrentWallets({ db, chainClient });
  await syncRecentHead({ db, chainClient });
  await reconcileCurrentWallets({ db, chainClient });

  assert.equal(await db.sttChainTransaction.count(), 1);
  assert.equal(await db.sttWallet.count(), 1);
  assert.equal(await db.sttWalletTransaction.count(), 1);
  assert.equal(await db.sttParticipant.count(), 5);
});

test("lookupSttWallets returns the same wallet for payment key hash and address queries", async () => {
  const fixture = createSttFixture();
  const chainClient = createMockChainClient();

  await syncRecentHead({ db, chainClient });
  await reconcileCurrentWallets({ db, chainClient });

  const byHash = await lookupSttWallets(
    {
      paymentKeyHash: TEST_CONNECTED_PAYMENT_KEY_HASH
    },
    {
      db,
      chainClient
    }
  );
  const byAddress = await lookupSttWallets(
    {
      address: TEST_CONNECTED_ADDRESS
    },
    {
      db,
      chainClient
    }
  );

  assert.deepEqual(
    byHash.wallets.map((wallet) => wallet.unit),
    [fixture.unit]
  );
  assert.deepEqual(
    byAddress.wallets.map((wallet) => wallet.unit),
    [fixture.unit]
  );
  assert.deepEqual(byAddress.wallets.map((wallet) => wallet.unit), byHash.wallets.map((wallet) => wallet.unit));
  assert.deepEqual(
    byHash.wallets[0]?.matchedRoles,
    ["ADMIN_USER", "BENEFICIARY", "STREAMING_PAYMENT_RECIPIENT"]
  );
});

test("lookupSttWallets performs read-through sync when the cache is empty and stale", async () => {
  const fixture = createSttFixture();
  const chainClient = createMockChainClient();

  const result = await lookupSttWallets(
    {
      paymentKeyHash: TEST_CONNECTED_PAYMENT_KEY_HASH
    },
    {
      db,
      chainClient
    }
  );

  assert.equal(result.sync.recentHeadTriggered, true);
  assert.equal(result.sync.reconcileTriggered, true);
  assert.deepEqual(
    result.wallets.map((wallet) => wallet.unit),
    [fixture.unit]
  );
  assert.equal(await db.sttWallet.count(), 1);
  assert.equal(await db.sttChainTransaction.count(), 1);
});
