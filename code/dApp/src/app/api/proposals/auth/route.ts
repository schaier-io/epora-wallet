import { checkSignature, resolvePaymentKeyHash } from "@meshsdk/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getProposalSession, jsonError } from "@/lib/proposals/api-helpers";
import {
  PROPOSAL_SESSION_COOKIE,
  issueSessionCookieValue,
  sessionCookieMaxAgeSeconds,
  verifyNonce
} from "@/lib/proposals/auth";

export const runtime = "nodejs";

// GET — report the current session (used by the client to restore sign-in).
export async function GET() {
  const session = await getProposalSession();
  if (!session) {
    return jsonError("Not signed in.", 401);
  }
  return NextResponse.json({ paymentKeyHash: session.paymentKeyHash, address: session.address });
}

const VerifySchema = z.object({
  address: z.string().trim().min(1),
  nonce: z.string().trim().min(1),
  signature: z.string().trim().min(1),
  key: z.string().trim().min(1)
});

// POST — verify a signed nonce and mint a session cookie. The signature is over
// the server-issued nonce and bound to the address, so it cannot be replayed.
export async function POST(request: Request) {
  try {
    const body = VerifySchema.parse(await request.json());

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
      return jsonError("Wallet signature did not verify against the nonce.", 401);
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
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid request.", 400);
    }
    return jsonError("Could not verify the wallet signature.", 500);
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
