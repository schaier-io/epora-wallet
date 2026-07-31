import { getPrisma } from "@/lib/prisma";
import { issueNonce, type VerifiedProposalNonce } from "./auth";

/** Issue and persist a challenge before returning its signed token to a client. */
export async function issueStoredNonce(address: string): Promise<string> {
  const issued = issueNonce(address);
  const db = getPrisma();

  // Challenges live for five minutes. Indexed cleanup on issuance prevents
  // expired/consumed rows from becoming permanent database growth.
  await db.proposalAuthChallenge.deleteMany({
    where: { expiresAt: { lte: new Date() } }
  });
  await db.proposalAuthChallenge.create({
    data: {
      id: issued.challengeId,
      addressHash: issued.addressHash,
      expiresAt: issued.expiresAt
    }
  });
  return issued.token;
}

/**
 * Atomically consume a verified challenge. Exactly one concurrent/replayed
 * request can change consumedAt from null; all later attempts return false.
 */
export async function consumeStoredNonce(challenge: VerifiedProposalNonce): Promise<boolean> {
  const now = new Date();
  const result = await getPrisma().proposalAuthChallenge.updateMany({
    where: {
      id: challenge.challengeId,
      addressHash: challenge.addressHash,
      expiresAt: { gt: now },
      consumedAt: null
    },
    data: { consumedAt: now }
  });
  return result.count === 1;
}
