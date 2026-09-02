import { NextResponse } from "next/server";
import { z } from "zod";
import {
  jsonError,
  requireProposalParticipant,
  requireSession,
  txBodyHashSchema
} from "@/lib/proposals/api-helpers";
import { assembleSignedTx } from "@/lib/proposals/assemble";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { rateLimit } from "@/lib/http/rate-limit";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import {
  claimProposalSubmission,
  completeProposalSubmission,
  releaseProposalSubmission
} from "@/lib/proposals/store";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiProposals[id]SubmitRoute");

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const SubmitSchema = z.object({
  expectedBodyHash: txBodyHashSchema
});

// POST /api/proposals/:id/submit: atomically claim, assemble, broadcast, and
// finalize the exact verified proposal body on the server.
export async function POST(request: Request, context: RouteContext) {
  const i18n = await getI18n();
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const limit = await rateLimit(
    `proposals:submit:${auth.session.paymentKeyHash}`,
    200,
    60 * 60 * 1000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: i18n("tooManyProposalSubmissionsTryAgainLater") },
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
    const body = SubmitSchema.parse(await readBoundedJson(request, 2 * 1024));
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
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError(error.message, 413);
    }
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? i18n("invalidSubmitPayload"), 400);
    }
    return jsonError(i18n("couldNotSubmitProposalTransaction"), 500);
  }
}
