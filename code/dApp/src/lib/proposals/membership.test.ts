import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { PrismaClient } from "@/generated/prisma";
import { participantWalletUnits, walletParticipantExists } from "@/lib/proposals/membership";
import { STT_CACHE_NETWORK } from "@/lib/stt-cache/domain";
import { createTestDatabaseClient, resetTestDatabase } from "@/lib/stt-cache/test-helpers";

// 56-char (28-byte) hex-shaped payment key hashes, matching real key-hash width.
const ALICE = "a1".repeat(28); // participant of wallet A
const BOB = "b2".repeat(28); // participant of wallet B
const MALLORY = "cc".repeat(28); // participant of nothing

const UNIT_A = "aaaaaaaa0001";
const UNIT_B = "bbbbbbbb0002";

let db: PrismaClient;

async function seedWallet(unit: string, participantKeyHashes: string[]): Promise<void> {
  const wallet = await db.sttWallet.create({
    data: {
      network: STT_CACHE_NETWORK,
      policyId: unit.slice(0, 8),
      assetNameHex: unit.slice(8),
      unit,
      sttScriptAddress: `stt_${unit}`,
      walletScriptAddress: `wallet_${unit}`
    }
  });
  await db.sttParticipant.createMany({
    data: participantKeyHashes.map((paymentKeyHash, index) => ({
      walletId: wallet.id,
      role: "signer",
      participantKey: `${unit}-${index}`,
      paymentKeyHash
    }))
  });
}

before(async () => {
  db = await createTestDatabaseClient();
});

beforeEach(async () => {
  await resetTestDatabase(db);
  await seedWallet(UNIT_A, [ALICE]);
  await seedWallet(UNIT_B, [BOB]);
});

after(async () => {
  await db.$disconnect();
});

test("walletParticipantExists is true only for an indexed participant of that wallet", async () => {
  assert.equal(await walletParticipantExists(db, UNIT_A, ALICE), true);
  assert.equal(await walletParticipantExists(db, UNIT_A, BOB), false);
  assert.equal(await walletParticipantExists(db, UNIT_A, MALLORY), false);
  // A participant of one wallet is not thereby a participant of another.
  assert.equal(await walletParticipantExists(db, UNIT_B, ALICE), false);
});

test("participantWalletUnits scopes to the caller's wallets — no cross-wallet leak", async () => {
  assert.deepEqual(await participantWalletUnits(db, ALICE), [UNIT_A]);
  assert.deepEqual(await participantWalletUnits(db, BOB), [UNIT_B]);
  // An outsider with no membership anywhere sees nothing.
  assert.deepEqual(await participantWalletUnits(db, MALLORY), []);
});

test("a participant of multiple wallets sees all of them, de-duplicated", async () => {
  const walletB = await db.sttWallet.findFirstOrThrow({ where: { unit: UNIT_B } });
  await db.sttParticipant.create({
    data: {
      walletId: walletB.id,
      role: "signer",
      participantKey: `${UNIT_B}-alice`,
      paymentKeyHash: ALICE
    }
  });

  const units = await participantWalletUnits(db, ALICE);
  assert.deepEqual([...units].sort(), [UNIT_A, UNIT_B].sort());
});
