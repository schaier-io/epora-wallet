import { NextResponse } from "next/server";
import { z } from "zod";
import {
  jsonError,
  requireProposalParticipant,
  requireSession,
  txBodyHashSchema
} from "@/lib/proposals/api-helpers";
import { markProposalSubmitted } from "@/lib/proposals/store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const SubmitSchema = z.object({
  // The on-chain tx hash returned after the assembled, fully-signed tx was
  // submitted from the browser. Equals the proposal's body hash.
  submittedTxHash: txBodyHashSchema
});

// POST /api/proposals/:id/submit — mark a proposal as submitted once the
// assembled transaction has been broadcast to the chain by the client.
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const access = await requireProposalParticipant(auth.session, id);
  if ("response" in access) {
    return access.response;
  }

  try {
    const body = SubmitSchema.parse(await request.json());
    const proposal = await markProposalSubmitted({
      proposalId: id,
      submittedTxHash: body.submittedTxHash
    });
    if (!proposal) {
      return jsonError("Proposal not found.", 404);
    }
    return NextResponse.json({ proposal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid submit payload.", 400);
    }
    return jsonError("Could not mark the proposal as submitted.", 500);
  }
}
