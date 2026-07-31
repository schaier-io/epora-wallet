import { NextResponse } from "next/server";
import { z } from "zod";
import {
  jsonError,
  requireProposalParticipant,
  requireSession,
  txBodyHashSchema
} from "@/lib/proposals/api-helpers";
import { assembleSignedTx } from "@/lib/proposals/assemble";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import {
  claimProposalSubmission,
  completeProposalSubmission,
  releaseProposalSubmission
} from "@/lib/proposals/store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const SubmitSchema = z.object({
  expectedBodyHash: txBodyHashSchema
});

// POST /api/proposals/:id/submit — atomically claim, assemble, broadcast, and
// finalize the exact verified proposal body on the server.
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
    const claimed = await claimProposalSubmission({
      proposalId: id,
      expectedBodyHash: body.expectedBodyHash
    });
    if (!claimed.ok) {
      return jsonError(claimed.error, claimed.status);
    }

    try {
      const submittedTxHash = await getBlockfrostProvider().submitTx(
        assembleSignedTx(claimed.proposal)
      );
      if (submittedTxHash.toLowerCase() !== body.expectedBodyHash.toLowerCase()) {
        throw new Error("Chain provider returned a different transaction hash.");
      }
      const completed = await completeProposalSubmission({
        proposalId: id,
        expectedBodyHash: body.expectedBodyHash
      });
      if (!completed.ok) {
        return jsonError(completed.error, completed.status);
      }
      return NextResponse.json({ proposal: completed.proposal });
    } catch (error) {
      await releaseProposalSubmission({
        proposalId: id,
        expectedBodyHash: body.expectedBodyHash
      });
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid submit payload.", 400);
    }
    return jsonError("Could not mark the proposal as submitted.", 500);
  }
}
