import { serializeScriptDrepId } from "@/lib/cardano-addresses";
import type { CstTransactionBody } from "@/lib/mesh/cst";
import type { VoteKind } from "@/lib/governance/vote-json";
import type { ProposalVoteView } from "./types";

// Ledger `vote` enum order (cardano-sdk `Cardano.Vote`).
const VOTE_KIND_BY_CODE: readonly VoteKind[] = ["No", "Yes", "Abstain"];

/**
 * The governance votes a transaction body casts, read from the body itself so a co-signer
 * sees what they sign rather than the proposer's note. A script DRep, the only voter a
 * smart wallet can be, is shown by its CIP-129 id; other voters by credential hash.
 */
export function decodeVotes(body: CstTransactionBody): ProposalVoteView[] {
  const procedures = body.votingProcedures()?.toCore() ?? [];
  return procedures.flatMap(({ voter, votes }) => {
    const voterId =
      voter.__typename === "dRepScriptHash"
        ? serializeScriptDrepId(voter.credential.hash)
        : voter.credential.hash;
    return votes.map(({ actionId, votingProcedure }) => ({
      voterType: voter.__typename,
      voterId,
      actionTxHash: actionId.id,
      actionIndex: actionId.actionIndex,
      vote: VOTE_KIND_BY_CODE[votingProcedure.vote] ?? null
    }));
  });
}
