import type { PrismaClient } from "@/generated/prisma";
import { STT_CACHE_NETWORK } from "@/lib/stt-cache/domain";

// Wallet-membership queries backing proposal authorization. Kept free of
// "server-only" and taking an explicit PrismaClient (like the stt-cache
// indexer) so the security-critical scoping can be unit-tested against a real
// database. store.ts composes these with the shared prisma singleton.

// True when `paymentKeyHash` is an indexed participant of the STT wallet
// identified by `walletUnit`. Membership comes from the chain indexer, which
// may lag a freshly-minted wallet — callers allow the proposer regardless.
export async function walletParticipantExists(
  db: PrismaClient,
  walletUnit: string,
  paymentKeyHash: string
): Promise<boolean> {
  const count = await db.sttParticipant.count({
    where: {
      paymentKeyHash,
      wallet: { network: STT_CACHE_NETWORK, unit: walletUnit }
    }
  });
  return count > 0;
}

// The distinct wallet units `paymentKeyHash` participates in, used to scope a
// proposal list so a signed-in wallet only sees its own wallets' proposals.
export async function participantWalletUnits(
  db: PrismaClient,
  paymentKeyHash: string
): Promise<string[]> {
  const memberships = await db.sttParticipant.findMany({
    where: { paymentKeyHash, wallet: { network: STT_CACHE_NETWORK } },
    select: { wallet: { select: { unit: true } } }
  });
  return [...new Set(memberships.map((membership) => membership.wallet.unit))];
}
