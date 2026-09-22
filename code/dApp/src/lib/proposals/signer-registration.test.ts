import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPrisma } from "@/lib/prisma";
import { STT_CACHE_NETWORK } from "@/lib/stt-cache/domain";
import {
  recordSignerRegistration,
  registeredWalletSignerKeyHashes
} from "./signer-registration";

const DB_SKIP = process.env.DATABASE_URL
  ? false
  : "DATABASE_URL not set; run via `pnpm test`";

function keyHash(): string {
  return randomUUID().replace(/-/g, "").repeat(2).slice(0, 56);
}

async function seedWallet(participantKeyHashes: string[]) {
  const unit = `unit_${randomUUID().replace(/-/g, "")}`;
  const wallet = await getPrisma().sttWallet.create({
    data: {
      network: STT_CACHE_NETWORK,
      policyId: `policy_${unit}`,
      assetNameHex: "00",
      unit,
      sttScriptAddress: `addr_stt_${unit}`,
      walletScriptAddress: `addr_wallet_${unit}`,
      participants: {
        create: participantKeyHashes.map((paymentKeyHash, index) => ({
          role: "USER",
          participantKey: `USER:${index}:${paymentKeyHash}`,
          paymentKeyHash
        }))
      }
    }
  });
  return { unit, walletId: wallet.id };
}

test("a signer is reported registered only after they sign in", { skip: DB_SKIP }, async (t) => {
  const registeredKey = keyHash();
  const pendingKey = keyHash();
  const { unit, walletId } = await seedWallet([registeredKey, pendingKey]);
  t.after(async () => {
    await getPrisma().sttWallet.delete({ where: { id: walletId } });
    await getPrisma().signerRegistration.deleteMany({
      where: { paymentKeyHash: { in: [registeredKey, pendingKey] } }
    });
  });

  assert.deepEqual(await registeredWalletSignerKeyHashes(getPrisma(), unit), []);

  await recordSignerRegistration(getPrisma(), registeredKey);

  assert.deepEqual(await registeredWalletSignerKeyHashes(getPrisma(), unit), [registeredKey]);
});

test("signing in twice keeps the first sign-in and moves the last", { skip: DB_SKIP }, async (t) => {
  const key = keyHash();
  t.after(async () => {
    await getPrisma().signerRegistration.deleteMany({ where: { paymentKeyHash: key } });
  });

  await recordSignerRegistration(getPrisma(), key);
  const first = await getPrisma().signerRegistration.findUniqueOrThrow({
    where: { paymentKeyHash: key }
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  await recordSignerRegistration(getPrisma(), key);
  const second = await getPrisma().signerRegistration.findUniqueOrThrow({
    where: { paymentKeyHash: key }
  });

  assert.equal(second.firstSignInAt.getTime(), first.firstSignInAt.getTime());
  assert.ok(second.lastSignInAt.getTime() > first.lastSignInAt.getTime());
});

// The endpoint must never become an oracle for "has this key ever used the
// app". A key that registered but shares no wallet with the caller is invisible.
test("a registered key from another wallet is not reported", { skip: DB_SKIP }, async (t) => {
  const outsiderKey = keyHash();
  const memberKey = keyHash();
  const { unit, walletId } = await seedWallet([memberKey]);
  t.after(async () => {
    await getPrisma().sttWallet.delete({ where: { id: walletId } });
    await getPrisma().signerRegistration.deleteMany({
      where: { paymentKeyHash: { in: [outsiderKey, memberKey] } }
    });
  });

  await recordSignerRegistration(getPrisma(), outsiderKey);

  assert.deepEqual(await registeredWalletSignerKeyHashes(getPrisma(), unit), []);
});
