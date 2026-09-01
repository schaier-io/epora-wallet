import { checkSignature, resolvePaymentKeyHash } from "@meshsdk/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { getProposalSession, jsonError } from "@/lib/proposals/api-helpers";
import {
  PROPOSAL_SESSION_COOKIE,
  issueSessionCookieValue,
  sessionCookieMaxAgeSeconds,
  verifyNonce
} from "@/lib/proposals/auth";
import { consumeStoredNonce } from "@/lib/proposals/auth-store";
import { logger, serializeError } from "@/lib/observability/logger";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiProposalsAuthRoute");

export const runtime = "nodejs";

// GET: report the current session (used by the client to restore sign-in).
export async function GET() {
  const i18n = await getI18n();
  const session = await getProposalSession();
  if (!session) {
    return jsonError(i18n("notSignedIn"), 401);
  }
  return NextResponse.json({ paymentKeyHash: session.paymentKeyHash, address: session.address });
}

const VerifySchema = z.object({
  address: z.string().trim().min(1).max(256),
  nonce: z.string().trim().min(1).max(2048),
  signature: z.string().trim().min(1).max(4096),
  key: z.string().trim().min(1).max(4096)
});

// Raised 10x from 20 on 2026-09-01, for the same reason as the nonce route's cap.
const VERIFY_RATE_LIMIT = 200;
const AUTH_RATE_WINDOW_MS = 5 * 60 * 1000;

// POST: verify a signed nonce and mint a session cookie. The signature is over
// the server-issued nonce and bound to the address. After signature validation,
// the persisted challenge is atomically consumed before a session is minted.
export async function POST(request: Request) {
  const i18n = await getI18n();
  try {
    const limit = await rateLimit(
      clientKey(request, "proposal-auth-verify"),
      VERIFY_RATE_LIMIT,
      AUTH_RATE_WINDOW_MS
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: i18n("tooManySignInAttemptsTryAgainShortly") },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    const body = VerifySchema.parse(await readBoundedJson(request, 16 * 1024));

    const nonceCheck = verifyNonce(body.nonce, body.address);
    if (!nonceCheck.ok) {
      return jsonError(nonceCheck.error, 400);
    }

    // A signature or COSE key the verifier cannot even parse is a rejected sign-in, not a
    // server fault. `checkSignature` throws on a malformed `signature`/`key`, and the throw
    // used to reach the outer catch and answer 500 "Could not verify wallet signature", which
    // reads as "the server is broken" and tells the reader nothing they can act on.
    //
    // The throw is logged rather than classified. `checkSignature` also parses the address and
    // awaits its dependency init, so not every throw is bad input; nothing in its contract
    // separates the two, and guessing would either send server faults back as 401 silently or
    // send bad input back as 500 again. Answering 401 is right for the caller either way (they
    // are not signed in, and there is nothing they can do about a broken verifier), so the
    // operator gets the signal instead: a verifier that is actually broken shows up as a run
    // of `api.proposal_auth_signature_check_failed` rather than as quiet 401s.
    let validSignature = false;
    try {
      validSignature = await checkSignature(
        body.nonce,
        { signature: body.signature, key: body.key },
        body.address
      );
    } catch (error) {
      logger.error("api.proposal_auth_signature_check_failed", { err: serializeError(error) });
      validSignature = false;
    }
    if (!validSignature) {
      return jsonError(i18n("walletSignatureDidNotVerify"), 401);
    }

    if (!(await consumeStoredNonce(nonceCheck))) {
      return jsonError(i18n("signInNonceAlreadyUsedOrExpired"), 409);
    }

    const paymentKeyHash = resolvePaymentKeyHash(body.address);
    const response = NextResponse.json({ paymentKeyHash, address: body.address });
    response.cookies.set({
      name: PROPOSAL_SESSION_COOKIE,
      value: issueSessionCookieValue({ paymentKeyHash, address: body.address }),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: sessionCookieMaxAgeSeconds()
    });
    return response;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError(error.message, 413);
    }
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? i18n("invalidRequest"), 400);
    }
    return jsonError(i18n("couldNotVerifyWalletSignature"), 500);
  }
}

// DELETE: sign out by clearing the session cookie.
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: PROPOSAL_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0
  });
  return response;
}
