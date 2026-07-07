import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildContextSchema,
  hexSchema,
  jsonError,
  reconcileBodyHash,
  requireProposalParticipant,
  requireSession,
  txBodyHashSchema
} from "@/lib/proposals/api-helpers";
import { replaceProposalBuild } from "@/lib/proposals/store";
import type { ProposalBuildContext } from "@/lib/proposals/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const RebuildSchema = z.object({
  // The freshly rebuilt unsigned tx (the client rebuilds against live chain
  // state because the builders need the browser wallet + Mesh).
  unsignedTxHex: hexSchema,
  txBodyHash: txBodyHashSchema,
  buildContext: buildContextSchema
});

// PATCH /api/proposals/:id/rebuild — replace an invalid proposal's transaction
// with a rebuilt one and drop all now-stale signatures. Any signed-in
// participant may rebuild a broken proposal so signing can restart cleanly.
export async function PATCH(request: Request, context: RouteContext) {
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
    const body = RebuildSchema.parse(await request.json());
    const proposal = await replaceProposalBuild({
      proposalId: id,
      unsignedTxHex: body.unsignedTxHex,
      txBodyHash: reconcileBodyHash(body.unsignedTxHex, body.txBodyHash),
      buildContext: body.buildContext as ProposalBuildContext
    });
    if (!proposal) {
      return jsonError("Proposal not found.", 404);
    }
    return NextResponse.json({ proposal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid rebuild payload.", 400);
    }
    return jsonError("Could not rebuild the proposal.", 500);
  }
}
