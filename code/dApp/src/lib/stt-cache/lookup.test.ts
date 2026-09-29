import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@/generated/prisma";
import { lookupSttWallets } from "./lookup";
import { STT_CACHE_NETWORK, STT_LOOKUP_WALLET_PAGE_SIZE } from "./domain";
import type { SttChainClient } from "./types";

type ParticipantRow = {
  walletId: string;
  role: string;
  wallet: Record<string, unknown> & { network: string };
};

function participantRow(
  walletId: string,
  lastSeenBlockTime: Date | null,
  network: string = STT_CACHE_NETWORK
): ParticipantRow {
  return {
    walletId,
    role: "owner",
    wallet: {
      id: walletId,
      network,
      policyId: "pp".repeat(28),
      assetNameHex: "stt",
      unit: `${"pp".repeat(28)}stt`,
      sttScriptAddress: "addr_test1stt",
      walletScriptAddress: "addr_test1wallet",
      status: "active",
      currentTxHash: "tx".repeat(32),
      currentOutputIndex: 0,
      lastSeenBlockHeight: 1,
      lastSeenBlockTime,
      currentDatumJson: null
    }
  };
}

type WalletQuery = {
  where?: {
    network?: string;
    id?: { gt?: string };
  };
  take?: number;
};

// Honours the query shape the lookup sends, so paging happens where the database would do it.
function findWallets(rows: ParticipantRow[], { where, take }: WalletQuery = {}) {
  const byId = new Map<string, { wallet: ParticipantRow["wallet"]; roles: string[] }>();
  for (const row of rows) {
    const entry = byId.get(row.walletId) ?? { wallet: row.wallet, roles: [] };
    entry.roles.push(row.role);
    byId.set(row.walletId, entry);
  }
  const matches = [...byId.entries()]
    .filter(([, entry]) => !where?.network || entry.wallet.network === where.network)
    .filter(([id]) => !where?.id?.gt || id > where.id.gt)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, entry]) => ({
      ...entry.wallet,
      participants: entry.roles.map((role) => ({ role })),
      walletTransactions: []
    }));
  return take === undefined ? matches : matches.slice(0, take);
}

function dbWithParticipants(rows: ParticipantRow[]): PrismaClient {
  return {
    sttSyncCursor: { findUnique: async () => null },
    sttWallet: { findMany: async (query?: WalletQuery) => findWallets(rows, query) }
  } as unknown as PrismaClient;
}

const chainClient = {
  fetchAddressTransactionsPage: () => {
    throw new Error("public lookup must not access the chain");
  },
  fetchAddressUTxOs: () => {
    throw new Error("public lookup must not access the chain");
  },
  fetchCollectionAssets: () => {
    throw new Error("public lookup must not access the chain");
  },
  fetchTxInfo: () => {
    throw new Error("public lookup must not access the chain");
  }
} as unknown as SttChainClient;

test("public lookup reads cached rows without triggering any chain reconciliation", async () => {
  const db = {
    sttSyncCursor: { findUnique: async () => null },
    sttWallet: { findMany: async () => [] }
  } as unknown as PrismaClient;

  const result = await lookupSttWallets(
    { paymentKeyHash: "aa".repeat(28) },
    { db, chainClient }
  );

  assert.deepEqual(result.wallets, []);
  assert.equal(result.sync.recentHeadTriggered, false);
  assert.equal(result.sync.reconcileTriggered, false);
});

test("touching the cursor wallet between pages never repeats or skips one", async () => {
  // 27 wallets, ids chosen so recency order and id order disagree. Page 1 ends
  // at `wallet-024`; touching it between the requests used to move it to the
  // front of the recency sort, and the old index-of-cursor pagination then
  // re-served page 1's wallets as page 2.
  const ids = Array.from({ length: STT_LOOKUP_WALLET_PAGE_SIZE + 2 }, (_, index) =>
    `wallet-${String(index).padStart(3, "0")}`
  );
  const db = dbWithParticipants(
    ids.map((id, index) =>
      participantRow(id, new Date((ids.length - index) * 1000))
    )
  );

  const first = await lookupSttWallets({ paymentKeyHash: "aa".repeat(28) }, { db, chainClient });
  assert.equal(first.wallets.length, STT_LOOKUP_WALLET_PAGE_SIZE);
  assert.deepEqual(
    first.wallets.map((wallet) => wallet.id),
    ids.slice(0, STT_LOOKUP_WALLET_PAGE_SIZE)
  );
  assert.equal(first.nextCursor, "wallet-024");

  const touchedDb = dbWithParticipants(
    ids.map((id, index) =>
      participantRow(id, new Date(id === "wallet-024" ? ids.length + 1 : ids.length - index))
    )
  );
  const second = await lookupSttWallets(
    { paymentKeyHash: "aa".repeat(28), cursor: first.nextCursor! },
    { db: touchedDb, chainClient }
  );
  assert.deepEqual(second.wallets.map((wallet) => wallet.id), ["wallet-025", "wallet-026"]);
  assert.equal(second.nextCursor, null);
});

test("a deleted cursor wallet does not restart the list", async () => {
  // The old cursor handling did `findIndex(cursor) + 1`: a deleted wallet read
  // as -1 + 1 = 0, so page 2 re-served page 1's wallets instead of the ones
  // after the cursor.
  const ids = Array.from({ length: STT_LOOKUP_WALLET_PAGE_SIZE + 2 }, (_, index) =>
    `wallet-${String(index).padStart(3, "0")}`
  );
  const db = dbWithParticipants(
    ids.map((id, index) => participantRow(id, new Date((ids.length - index) * 1000)))
  );

  const first = await lookupSttWallets({ paymentKeyHash: "aa".repeat(28) }, { db, chainClient });
  assert.equal(first.nextCursor, "wallet-024");

  const afterDelete = dbWithParticipants(
    ids
      .filter((id) => id !== "wallet-024")
      .map((id, index) => participantRow(id, new Date((ids.length - index) * 1000)))
  );
  const second = await lookupSttWallets(
    { paymentKeyHash: "aa".repeat(28), cursor: "wallet-024" },
    { db: afterDelete, chainClient }
  );
  assert.deepEqual(second.wallets.map((wallet) => wallet.id), ["wallet-025", "wallet-026"]);
  assert.equal(second.nextCursor, null);
});

test("a last page that fills exactly returns no cursor", async () => {
  const ids = Array.from({ length: STT_LOOKUP_WALLET_PAGE_SIZE * 2 }, (_, index) =>
    `wallet-${String(index).padStart(3, "0")}`
  );
  const db = dbWithParticipants(
    ids.map((id, index) => participantRow(id, new Date((ids.length - index) * 1000)))
  );

  const first = await lookupSttWallets({ paymentKeyHash: "aa".repeat(28) }, { db, chainClient });
  assert.equal(first.nextCursor, `wallet-${String(STT_LOOKUP_WALLET_PAGE_SIZE - 1).padStart(3, "0")}`);
  const second = await lookupSttWallets(
    { paymentKeyHash: "aa".repeat(28), cursor: first.nextCursor! },
    { db, chainClient }
  );
  assert.equal(second.wallets.length, STT_LOOKUP_WALLET_PAGE_SIZE);
  assert.equal(second.nextCursor, null);
});

test("an unknown cursor starts after its position in id order", async () => {
  const ids = ["wallet-a", "wallet-c", "wallet-e"];
  const db = dbWithParticipants(
    ids.map((id, index) => participantRow(id, new Date((ids.length - index) * 1000)))
  );

  const between = await lookupSttWallets(
    { paymentKeyHash: "aa".repeat(28), cursor: "wallet-b" },
    { db, chainClient }
  );
  assert.deepEqual(between.wallets.map((wallet) => wallet.id), ["wallet-c", "wallet-e"]);

  const pastEnd = await lookupSttWallets(
    { paymentKeyHash: "aa".repeat(28), cursor: "zzz" },
    { db, chainClient }
  );
  assert.deepEqual(pastEnd.wallets, []);
  assert.equal(pastEnd.nextCursor, null);
});

test("a wallet cached for another network is never listed", async () => {
  const db = dbWithParticipants([
    participantRow("wallet-a", null),
    participantRow("wallet-b", null, STT_CACHE_NETWORK === "mainnet" ? "preprod" : "mainnet")
  ]);

  const result = await lookupSttWallets({ paymentKeyHash: "aa".repeat(28) }, { db, chainClient });

  assert.deepEqual(result.wallets.map((wallet) => wallet.id), ["wallet-a"]);
});

test("a key in more wallets than a page reads only one page of wallets", async () => {
  const ids = Array.from({ length: STT_LOOKUP_WALLET_PAGE_SIZE * 4 }, (_, index) =>
    `wallet-${String(index).padStart(3, "0")}`
  );
  const db = dbWithParticipants(ids.map((id) => participantRow(id, null)));
  const findMany = db.sttWallet.findMany as unknown as (query?: WalletQuery) => Promise<unknown[]>;
  const returned: number[] = [];
  (db.sttWallet as unknown as { findMany: typeof findMany }).findMany = async (query) => {
    const rows = await findMany(query);
    returned.push(rows.length);
    return rows;
  };

  await lookupSttWallets({ paymentKeyHash: "aa".repeat(28) }, { db, chainClient });

  assert.ok(Math.max(...returned) <= STT_LOOKUP_WALLET_PAGE_SIZE + 1);
});
