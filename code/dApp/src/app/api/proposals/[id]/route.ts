import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/http/rate-limit";
import { jsonError, requireProposalParticipant, requireSession } from "@/lib/proposals/api-helpers";
import {
  cancelProposalRecord,
  getProposalRecord
} from "@/lib/proposals/store";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiProposals[id]Route");

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/proposals/:id: full detail (tx hex, build context, witnesses) for
// local verification, signing and assembly.
export async function GET(_request: Request, context: RouteContext) {
  const i18n = await getI18n();
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const limit = await rateLimit(`proposals:detail:${auth.session.paymentKeyHash}`, 120, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: i18n("tooManyProposalDetailRequestsTryAgainShortly") },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { id } = await context.params;
  if (id.length > 64) return jsonError(i18n("proposalIdTooLong"), 400);
  const access = await requireProposalParticipant(auth.session, id);
  if ("response" in access) {
    return access.response;
  }

  const proposal = await getProposalRecord(id);
  if (!proposal) {
    return jsonError(i18n("proposalNotFound"), 404);
  }
  return NextResponse.json({ proposal });
}

// DELETE /api/proposals/:id: cancel. Only the creator may cancel their own
// proposal; it stays in the list marked CANCELLED rather than being deleted.
export async function DELETE(_request: Request, context: RouteContext) {
  const i18n = await getI18n();
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
      { error: i18n("tooManyProposalCancellationsTryAgainLater") },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { id } = await context.params;
  if (id.length > 64) return jsonError(i18n("proposalIdTooLong"), 400);
  const result = await cancelProposalRecord({
    proposalId: id,
    actorKeyHash: auth.session.paymentKeyHash
  });
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return NextResponse.json({ ok: true });
}
