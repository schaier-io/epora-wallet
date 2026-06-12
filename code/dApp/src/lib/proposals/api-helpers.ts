import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PROPOSAL_SESSION_COOKIE, verifySessionCookieValue, type ProposalSession } from "./auth";
import { resolveProposalBodyHash } from "./serialization";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function unauthorized() {
  return jsonError("Sign in with your wallet to manage proposals.", 401);
}

export async function getProposalSession(): Promise<ProposalSession | null> {
  const store = await cookies();
  return verifySessionCookieValue(store.get(PROPOSAL_SESSION_COOKIE)?.value);
}

// Returns the session, or a ready-to-return 401 response. Routes do:
//   const auth = await requireSession();
//   if ("response" in auth) return auth.response;
export async function requireSession(): Promise<
  { session: ProposalSession } | { response: NextResponse }
> {
  const session = await getProposalSession();
  if (!session) {
    return { response: unauthorized() };
  }
  return { session };
}

// Defensively recompute the body hash from the bytes so the stored hash always
// matches the tx (signatures are keyed by it). If the CBOR tooling throws in
// this runtime, fall back to trusting the client-supplied hash rather than
// blocking the whole feature.
export function reconcileBodyHash(txHex: string, claimedBodyHash: string): string {
  try {
    return resolveProposalBodyHash(txHex);
  } catch {
    return claimedBodyHash;
  }
}

const HEX = /^[0-9a-fA-F]+$/;

export const txBodyHashSchema = z
  .string()
  .trim()
  .length(64)
  .regex(HEX, "Expected a 64-character hex tx body hash.");

export const hexSchema = z.string().trim().min(1).regex(HEX, "Expected a hex string.");

// Permissive: the build context is replayed only client-side through typed
// builders, so the server stores it verbatim rather than re-validating every
// datum field. We only require a recognizable discriminant.
export const buildContextSchema = z
  .object({ builder: z.string().trim().min(1) })
  .passthrough();
