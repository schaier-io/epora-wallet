import type { PrismaClient } from "@/generated/prisma";
import { STT_CACHE_NETWORK } from "@/lib/stt-cache/domain";
import { participantWalletUnits } from "./membership";
import { mapListItem } from "./store-logic";
import {
  ACTIVE_PROPOSAL_STATUSES,
  TERMINAL_PROPOSAL_STATUSES,
  decodeProposalCursor,
  encodeProposalCursor,
  paginateProposalRows,
  proposalListSegment,
  type ProposalPageCursor,
  type ProposalPagePosition
} from "./list-pagination";
import type { ProposalListItemDto } from "./types";

// DB query composition for the participant-scoped proposal list (issue #401
// keyset pagination). Kept free of "server-only" and taking an explicit
// PrismaClient (like delete-record.ts and membership.ts) so cursor decoding,
// the keyset where-composition, and visibility scoping can be tested against a
// real database. store.ts binds the singleton client and keeps the
// route-facing three-argument signature.

// Strictly after `position` in the (createdAt desc, id desc) list ordering.
// Pure value comparison, so positioning works even when the cursor row itself
// changed status or is no longer visible to the caller.
function keysetAfter(position: ProposalPagePosition) {
  const createdAt = new Date(position.createdAt);
  return {
    OR: [
      { createdAt: { lt: createdAt } },
      { createdAt: { equals: createdAt }, id: { lt: position.id } }
    ]
  };
}

// Lists proposals visible to a participant: those targeting wallets they belong
// to (per the chain indexer) plus any they created; the proposer fallback
// covers indexer lag on a freshly-minted wallet. Optionally narrowed to a
// single walletUnit. Replaces the old unscoped list so a signed-in wallet can
// no longer enumerate every wallet's proposals.
export async function listProposalRecordsForParticipant(
  db: PrismaClient,
  paymentKeyHash: string,
  walletUnit: string | undefined,
  options: { limit: number; cursor?: string }
): Promise<{ proposals: ProposalListItemDto[]; nextCursor: string | null }> {
  const memberUnits = await participantWalletUnits(db, paymentKeyHash);
  const visibleWhere = {
    network: STT_CACHE_NETWORK,
    ...(walletUnit ? { walletUnit } : {}),
    OR: [{ walletUnit: { in: memberUnits } }, { createdByKeyHash: paymentKeyHash }]
  };

  // A cursor token carries the segment and sort position captured when the page
  // was served, so a proposal changing status between page requests cannot move
  // the remaining rows out from under the cursor. Bare proposal ids are legacy
  // tokens held by clients that paginated before tokens existed; they keep the
  // previous behavior, deriving the segment from the row's live status. The
  // lookup resolves the cursor only inside the caller's visible set, which also
  // stops an arbitrary proposal id from becoming a cross-wallet cursor oracle.
  let cursor: ProposalPageCursor | undefined;
  if (options.cursor) {
    const decoded = decodeProposalCursor(options.cursor);
    if (decoded) {
      cursor = decoded;
    } else {
      const cursorRow = await db.multiSigProposal.findFirst({
        where: { ...visibleWhere, id: options.cursor },
        select: { status: true, createdAt: true }
      });
      if (!cursorRow) {
        return { proposals: [], nextCursor: null };
      }
      cursor = {
        segment: proposalListSegment(cursorRow.status),
        createdAt: cursorRow.createdAt.toISOString(),
        id: options.cursor
      };
    }
  }

  const page = await paginateProposalRows(
    { limit: options.limit, cursor },
    ({ segment, before, take }) =>
      db.multiSigProposal.findMany({
        where: {
          AND: [
            visibleWhere,
            {
              status: {
                in: [
                  ...(segment === "active"
                    ? ACTIVE_PROPOSAL_STATUSES
                    : TERMINAL_PROPOSAL_STATUSES)
                ]
              }
            },
            ...(before ? [keysetAfter(before)] : [])
          ]
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        select: {
          id: true,
          walletUnit: true,
          walletPolicyId: true,
          title: true,
          description: true,
          actionKind: true,
          authorityPath: true,
          status: true,
          txBodyHash: true,
          submittedTxHash: true,
          createdByKeyHash: true,
          createdAt: true,
          updatedAt: true,
          signatures: {
            select: { signerKeyHash: true, txBodyHash: true }
          }
        }
      })
  );
  return {
    proposals: page.rows.map((row) => mapListItem(row, row.signatures)),
    nextCursor: page.nextCursor ? encodeProposalCursor(page.nextCursor) : null
  };
}
