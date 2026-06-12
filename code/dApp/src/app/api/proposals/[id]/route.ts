import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/proposals/api-helpers";
import {
  cancelProposalRecord,
  getProposalOwner,
  getProposalRecord
} from "@/lib/proposals/store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/proposals/:id — full detail (tx hex, build context, witnesses) for
// local verification, signing and assembly.
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const proposal = await getProposalRecord(id);
  if (!proposal) {
    return jsonError("Proposal not found.", 404);
  }
  return NextResponse.json({ proposal });
}

// DELETE /api/proposals/:id — cancel. Only the creator may cancel their own
// proposal; it stays in the list marked CANCELLED rather than being deleted.
export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const owner = await getProposalOwner(id);
  if (!owner) {
    return jsonError("Proposal not found.", 404);
  }
  if (owner.createdByKeyHash !== auth.session.paymentKeyHash) {
    return jsonError("Only the proposer can cancel this proposal.", 403);
  }

  await cancelProposalRecord(id);
  return NextResponse.json({ ok: true });
}
