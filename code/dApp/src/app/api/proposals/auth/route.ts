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
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiProposalsAuthRoute");

export const runtime = "nodejs";

// GET — report the current session (used by the client to restore sign-in).
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

const VERIFY_RATE_LIMIT = 20;
const AUTH_RATE_WINDOW_MS = 5 * 60 * 1000;

// POST — verify a signed nonce and mint a session cookie. The signature is over
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

    const validSignature = await checkSignature(
      body.nonce,
      { signature: body.signature, key: body.key },
      body.address
    );
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

// DELETE — sign out by clearing the session cookie.
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
