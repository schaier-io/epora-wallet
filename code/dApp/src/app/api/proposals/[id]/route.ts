import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/http/rate-limit";
import { jsonError, requireProposalParticipant, requireSession } from "@/lib/proposals/api-helpers";
import {
  disposeProposalRecord,
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

  const limit = await rateLimit(`proposals:detail:${auth.session.paymentKeyHash}`, 1200, 60_000);
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

// DELETE /api/proposals/:id: creator removal, dispatched by stored status. An
// OPEN request is withdrawn (cancelled) so nobody else can sign it; a finished
// one (CANCELLED or SUBMITTED) is deleted with its recorded signatures. Only the
// creator may remove their own proposal in either direction.
export async function DELETE(_request: Request, context: RouteContext) {
  const i18n = await getI18n();
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const limit = await rateLimit(
    `proposals:cancel:${auth.session.paymentKeyHash}`,
    300,
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
  const result = await disposeProposalRecord({
    proposalId: id,
    actorKeyHash: auth.session.paymentKeyHash
  });
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return NextResponse.json({ ok: true });
}
