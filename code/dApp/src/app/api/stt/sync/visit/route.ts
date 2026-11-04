import { NextResponse } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import {
  InvalidJsonError,
  readBoundedJson,
  RequestBodyTooDeepError,
  RequestBodyTooLargeError
} from "@/lib/http/request-body";
import { assertServerWalletAddress, ServerWalletAddressError } from "@/lib/mesh/server-wallet";
import { logger, serializeError } from "@/lib/observability/logger";
import { getProposalSession } from "@/lib/proposals/api-helpers";
import { runSttVisitSync, STT_VISIT_SYNC_COOLDOWN_MS } from "@/lib/stt-cache/visit-sync";

export const runtime = "nodejs";
export const maxDuration = 300;
const NO_STORE = { "Cache-Control": "no-store" };
const MAX_VISIT_REQUEST_BYTES = 512;
const VisitSchema = z.object({ address: z.string().trim().min(1).max(256).optional() }).strict();

export async function POST(request: Request) {
  const i18n = await getTranslations("AppApiSttSyncVisitRoute");
  // Reject browser cross-site requests and missing origins before session or DB work.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: i18n("sameOriginRequired") }, { status: 403, headers: NO_STORE });
  }
  try {
    const body = VisitSchema.parse(await readBoundedJson(request, MAX_VISIT_REQUEST_BYTES));
    const session = await getProposalSession();
    if (body.address) assertServerWalletAddress(body.address);
    if (!session && !body.address) {
      return NextResponse.json({ error: i18n("connectOrSignIn") }, { status: 401, headers: NO_STORE });
    }
    // An address is only an unauthenticated visit hint. It grants no wallet
    // access and never substitutes for proposal authentication or membership.
    const result = await runSttVisitSync();
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413, headers: NO_STORE });
    }
    if (error instanceof z.ZodError || error instanceof InvalidJsonError ||
        error instanceof RequestBodyTooDeepError || error instanceof ServerWalletAddressError) {
      return NextResponse.json({ error: i18n("invalidRequest") }, { status: 400, headers: NO_STORE });
    }
    logger.error("api.stt_visit_sync_failed", { err: serializeError(error) });
    return NextResponse.json(
      { error: i18n("syncFailed"), retryAfterMs: STT_VISIT_SYNC_COOLDOWN_MS },
      { status: 500, headers: NO_STORE }
    );
  }
}
