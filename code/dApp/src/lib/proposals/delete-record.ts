import type { PrismaClient } from "@/generated/prisma";
import { proposalCopy } from "./copy";
import { TERMINAL_PROPOSAL_STATUSES } from "./list-pagination";
import { evaluateProposalDeleteGuard } from "./store-logic";

// Hard deletion of a finished proposal (CANCELLED or SUBMITTED). Kept free of
// "server-only" and taking an explicit PrismaClient (like membership.ts) so the
// authorization and status guard can be tested against a real database.
// store.ts composes this with the shared prisma singleton.

// Deletes the proposal only when it still belongs to the actor and is still in a
// terminal status; the conditional write closes the gap between the guard's read
// and the delete, so a request cancelled or submitted in between cannot be
// removed. Recorded signatures go with it through the schema's cascade, and a
// request that is not finished answers 409 with its current status.
export async function deleteFinishedProposalRecord(
  db: PrismaClient,
  args: { proposalId: string; actorKeyHash: string }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const existing = await db.multiSigProposal.findUnique({
    where: { id: args.proposalId },
    select: { createdByKeyHash: true, status: true }
  });
  const guard = evaluateProposalDeleteGuard(existing, args.actorKeyHash);
  if (!guard.ok) {
    return guard;
  }
  const deleted = await db.multiSigProposal.deleteMany({
    where: {
      id: args.proposalId,
      createdByKeyHash: args.actorKeyHash,
      status: { in: [...TERMINAL_PROPOSAL_STATUSES] }
    }
  });
  return deleted.count === 1
    ? { ok: true }
    : { ok: false, status: 409, error: proposalCopy.changedWhileDeleting() };
}
