import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { jsonError } from "@/lib/proposals/api-helpers";
import { issueStoredNonce } from "@/lib/proposals/auth-store";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiProposalsAuthNonceRoute");

export const runtime = "nodejs";

const RequestSchema = z.object({
  address: z.string().trim().min(1).max(256)
});

const NONCE_RATE_LIMIT = 20;
const AUTH_RATE_WINDOW_MS = 5 * 60 * 1000;

// Issues a short-lived, address-bound nonce for the wallet to sign with CIP-30
// `signData`. Proving control of the signing key is the entire authentication:
// there is no password and no user record.
export async function POST(request: Request) {
  const i18n = await getI18n();
  try {
    const limit = await rateLimit(
      clientKey(request, "proposal-auth-nonce"),
      NONCE_RATE_LIMIT,
      AUTH_RATE_WINDOW_MS
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: i18n("tooManySignInChallengesTryAgainShortly") },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    const body = RequestSchema.parse(await readBoundedJson(request, 2 * 1024));
    return NextResponse.json({ nonce: await issueStoredNonce(body.address) });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError(error.message, 413);
    }
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? i18n("invalidRequest"), 400);
    }
    return jsonError(i18n("couldNotIssueSignInNonce"), 500);
  }
}
