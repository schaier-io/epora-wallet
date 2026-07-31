import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@/generated/prisma";
import { lookupSttWallets } from "./lookup";
import type { SttChainClient } from "./types";

test("public lookup reads cached rows without triggering any chain reconciliation", async () => {
  const db = {
    sttSyncCursor: { findUnique: async () => null },
    sttParticipant: { findMany: async () => [] },
    sttWallet: { findMany: async () => [] }
  } as unknown as PrismaClient;
  const chainAccess = () => {
    throw new Error("public lookup must not access the chain");
  };
  const chainClient = {
    fetchAddressTransactionsPage: chainAccess,
    fetchAddressUTxOs: chainAccess,
    fetchCollectionAssets: chainAccess,
    fetchTxInfo: chainAccess
  } as unknown as SttChainClient;

  const result = await lookupSttWallets(
    { paymentKeyHash: "aa".repeat(28) },
    { db, chainClient }
  );

  assert.deepEqual(result.wallets, []);
  assert.equal(result.sync.recentHeadTriggered, false);
  assert.equal(result.sync.reconcileTriggered, false);
});
