import { NextResponse } from "next/server";
import { z } from "zod";
import {
  jsonError,
  requireProposalParticipant,
  requireSession,
  txBodyHashSchema
} from "@/lib/proposals/api-helpers";
import { assembleSignedTx } from "@/lib/proposals/assemble";
import { assertSerializedTransactionIsBounded } from "@/lib/mesh/transactions/internals/budget";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { rateLimit } from "@/lib/http/rate-limit";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import { logger, serializeError } from "@/lib/observability/logger";
import {
  claimProposalSubmission,
  completeProposalSubmission,
  releaseProposalSubmission
} from "@/lib/proposals/store";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiProposals[id]SubmitRoute");

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Mesh wraps every submit failure in a JSON string. A 4xx means the provider
// answered without forwarding the tx; anything else may have reached the chain.
function wasRefusedBeforeBroadcast(error: unknown) {
  if (typeof error !== "string") return false;
  try {
    const status = (JSON.parse(error) as { status?: unknown }).status;
    return typeof status === "number" && status >= 400 && status < 500;
  } catch {
    return false;
  }
}

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

    const releaseClaim = () =>
      releaseProposalSubmission({ proposalId: id, expectedBodyHash: body.expectedBodyHash });

    // Nothing before the broadcast can have reached the chain, so a failure here
    // hands the row back. Only the broadcast itself can have an unknown outcome.
    let signedTx: string;
    let provider: ReturnType<typeof getBlockfrostProvider>;
    try {
      signedTx = assembleSignedTx(claimed.proposal);
      assertSerializedTransactionIsBounded(signedTx);
      provider = getBlockfrostProvider();
    } catch (error) {
      await releaseClaim();
      throw error;
    }

    let submittedTxHash: string;
    try {
      submittedTxHash = await provider.submitTx(signedTx);
    } catch (error) {
      if (!wasRefusedBeforeBroadcast(error)) {
        // A timeout or a 5xx may hide a broadcast that went through, so the row
        // stays SUBMITTING rather than inviting a rebuild of a tx the chain may hold.
        logger.error("api.proposal_submit_outcome_unknown", {
          proposalId: id,
          expectedBodyHash: body.expectedBodyHash,
          err: serializeError(error)
        });
        return jsonError(i18n("couldNotSubmitProposalTransaction"), 500);
      }
      await releaseClaim();
      throw error;
    }

    // From here on the chain has accepted the transaction. The row must not go back to
    // OPEN: a later verify would see the inputs spent, offer a rebuild, and the rebuild
    // would execute the same transfer a second time. A failure below leaves the row
    // SUBMITTING with the tx hash in the log so an operator can finish it by hand.
    if (submittedTxHash.toLowerCase() !== body.expectedBodyHash.toLowerCase()) {
      logger.error("api.proposal_submit_hash_mismatch", {
        proposalId: id,
        expectedBodyHash: body.expectedBodyHash,
        submittedTxHash
      });
      return jsonError(i18n("couldNotSubmitProposalTransaction"), 500);
    }
    try {
      const completed = await completeProposalSubmission({
        proposalId: id,
        expectedBodyHash: body.expectedBodyHash
      });
      if (!completed.ok) {
        logger.error("api.proposal_submit_record_failed", {
          proposalId: id,
          submittedTxHash,
          error: completed.error
        });
        return jsonError(completed.error, completed.status);
      }
      return NextResponse.json({ proposal: completed.proposal });
    } catch (error) {
      logger.error("api.proposal_submit_record_failed", {
        proposalId: id,
        submittedTxHash,
        err: serializeError(error)
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
