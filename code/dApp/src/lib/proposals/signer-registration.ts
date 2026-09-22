import type { PrismaClient } from "@/generated/prisma";
import { STT_CACHE_NETWORK } from "@/lib/stt-cache/domain";

// Which wallet keys have finished registering, i.e. completed the CIP-30
// sign-in at least once. Kept free of "server-only" and taking an explicit
// PrismaClient (like membership.ts) so the scoping below can be tested against
// a real database. signer-registration-store.ts composes these with the shared
// prisma singleton.

/**
 * Remember that `paymentKeyHash` signed in. Called once per successful sign-in,
 * so the row's `firstSignInAt` answers "did this co-signer ever register" and
 * `lastSignInAt` answers "are they still using the app".
 */
export async function recordSignerRegistration(
  db: PrismaClient,
  paymentKeyHash: string
): Promise<void> {
  const now = new Date();
  await db.signerRegistration.upsert({
    where: { paymentKeyHash },
    create: { paymentKeyHash, firstSignInAt: now, lastSignInAt: now },
    update: { lastSignInAt: now }
  });
}

/**
 * The key hashes of `walletUnit`'s indexed participants that have registered.
 *
 * The answer is deliberately an intersection with the wallet's own participant
 * list rather than a lookup of caller-supplied hashes. A caller who could ask
 * about arbitrary hashes would turn this into an oracle for "has this key ever
 * used the app", which is not a question a wallet member is entitled to ask
 * about a stranger's key. Here the caller can only learn about keys that
 * already share a wallet with them.
 */
export async function registeredWalletSignerKeyHashes(
  db: PrismaClient,
  walletUnit: string
): Promise<string[]> {
  const participants = await db.sttParticipant.findMany({
    where: {
      paymentKeyHash: { not: null },
      wallet: { network: STT_CACHE_NETWORK, unit: walletUnit }
    },
    select: { paymentKeyHash: true }
  });

  const keyHashes = [
    ...new Set(
      participants
        .map((participant) => participant.paymentKeyHash)
        .filter((hash): hash is string => Boolean(hash))
    )
  ];
  if (keyHashes.length === 0) {
    return [];
  }

  const registered = await db.signerRegistration.findMany({
    where: { paymentKeyHash: { in: keyHashes } },
    select: { paymentKeyHash: true }
  });
  return registered.map((row) => row.paymentKeyHash);
}
