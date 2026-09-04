import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildContextSchema,
  jsonError,
  reconcileBodyHash,
  requireProposalParticipant,
  requireSession,
  txBodyHashSchema,
  unsignedTxHexSchema
} from "@/lib/proposals/api-helpers";
import { rateLimit } from "@/lib/http/rate-limit";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { replaceProposalBuild } from "@/lib/proposals/store";
import type { ProposalBuildContext } from "@/lib/proposals/types";
import { InvalidProposalTransactionError } from "@/lib/proposals/serialization";
import {
  assertProposalWalletBinding,
  InvalidProposalBuildContextError
} from "@/lib/proposals/validation";
import { assertProposalTransactionBinding } from "@/lib/proposals/transaction-binding";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiProposals[id]RebuildRoute");

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const RebuildSchema = z.object({
  // The freshly rebuilt unsigned tx (the client rebuilds against live chain
  // state because the builders need the browser wallet + Mesh).
  unsignedTxHex: unsignedTxHexSchema,
  txBodyHash: txBodyHashSchema,
  expectedBodyHash: txBodyHashSchema,
  buildContext: buildContextSchema
});

// PATCH /api/proposals/:id/rebuild: replace an invalid proposal's transaction
// with a rebuilt one and drop all now-stale signatures. Only the proposer may
// rebuild (`evaluateProposalRebuildGuard`); co-signers see a note instead.
export async function PATCH(request: Request, context: RouteContext) {
  const i18n = await getI18n();
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const limit = await rateLimit(
    `proposals:rebuild:${auth.session.paymentKeyHash}`,
    300,
    60 * 60 * 1000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: i18n("tooManyProposalRebuildsTryAgainLater") },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { id } = await context.params;
  if (id.length > 64) return jsonError(i18n("proposalIdTooLong"), 400);
  const access = await requireProposalParticipant(auth.session, id);
  if ("response" in access) {
    return access.response;
  }

  try {
    const body = RebuildSchema.parse(await readBoundedJson(request, 768 * 1024));
    const buildContext = body.buildContext as ProposalBuildContext;
    const actionKind = buildContext.builder === "stt-spend"
      ? buildContext.mode
      : buildContext.builder;
    if (
      buildContext.builder !== access.access.builder ||
      actionKind !== access.access.actionKind
    ) {
      throw new InvalidProposalBuildContextError(i18n("invalidRebuildPayload"));
    }
    assertProposalWalletBinding({
      walletUnit: access.access.walletUnit,
      walletPolicyId: access.access.walletPolicyId,
      authorityPath: access.access.authorityPath,
      builder: buildContext.builder,
      buildContext
    });
    assertProposalTransactionBinding({
      unsignedTxHex: body.unsignedTxHex,
      buildContext
    });
    const result = await replaceProposalBuild({
      proposalId: id,
      actorKeyHash: auth.session.paymentKeyHash,
      expectedBodyHash: body.expectedBodyHash,
      unsignedTxHex: body.unsignedTxHex,
      txBodyHash: reconcileBodyHash(body.unsignedTxHex, body.txBodyHash),
      buildContext
    });
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }
    return NextResponse.json({ proposal: result.proposal });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError(error.message, 413);
    }
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? i18n("invalidRebuildPayload"), 400);
    }
    if (error instanceof InvalidProposalTransactionError) {
      return jsonError(error.message, 400);
    }
    if (error instanceof InvalidProposalBuildContextError) {
      return jsonError(error.message, 400);
    }
    return jsonError(i18n("couldNotRebuildProposal"), 500);
  }
}
