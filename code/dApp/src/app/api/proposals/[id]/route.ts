import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/http/rate-limit";
import { readBoundedJson } from "@/lib/http/request-body";
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

// DELETE /api/proposals/:id: creator removal with an explicit intent in the
// JSON body. "cancel" (the default, and what clients without a body send)
// withdraws an OPEN request so nobody else can sign it; "delete" removes a
// finished one with its recorded signatures. The intent, not the stored
// status, picks the path, so a stale withdraw click can never become an
// unconfirmed delete. Only the creator may remove their own proposal in
// either direction.
export async function DELETE(request: Request, context: RouteContext) {
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
  // Bodies this route does not understand fall back to the cancel intent: the
  // pre-delete behavior every existing client relies on. The bounded read
  // keeps a large or unparseable body from being held in memory.
  const body = (await readBoundedJson(request, 4 * 1024).catch(() => null)) as {
    intent?: unknown;
  } | null;
  const intent = body?.intent === "delete" ? "delete" : "cancel";
  const result = await disposeProposalRecord({
    proposalId: id,
    actorKeyHash: auth.session.paymentKeyHash,
    intent
  });
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return NextResponse.json({ ok: true });
}
