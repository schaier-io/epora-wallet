import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/http/rate-limit";
import { jsonError, requireProposalParticipant, requireSession } from "@/lib/proposals/api-helpers";
import {
  cancelProposalRecord,
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

  const limit = await rateLimit(`proposals:detail:${auth.session.paymentKeyHash}`, 120, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many proposal-detail requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { id } = await context.params;
  if (id.length > 64) return jsonError("Proposal id is too long.", 400);
  const access = await requireProposalParticipant(auth.session, id);
  if ("response" in access) {
    return access.response;
  }

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

  const limit = await rateLimit(
    `proposals:cancel:${auth.session.paymentKeyHash}`,
    30,
    60 * 60 * 1000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many proposal cancellations. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { id } = await context.params;
  if (id.length > 64) return jsonError("Proposal id is too long.", 400);
  const result = await cancelProposalRecord({
    proposalId: id,
    actorKeyHash: auth.session.paymentKeyHash
  });
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return NextResponse.json({ ok: true });
}
