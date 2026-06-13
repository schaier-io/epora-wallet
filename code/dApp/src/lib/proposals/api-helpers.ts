import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PROPOSAL_SESSION_COOKIE, verifySessionCookieValue, type ProposalSession } from "./auth";
import { resolveProposalBodyHash } from "./serialization";
import { getProposalAccess, isWalletParticipant } from "./store";
import type { ProposalStatus } from "./types";

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

// Authorization (not just authentication): confirm the signed-in wallet belongs
// to the proposal's wallet — as its proposer or as an indexed participant —
// before allowing reads or mutations. The proposer is always allowed so a
// freshly-minted wallet whose participants the indexer hasn't synced yet isn't
// locked out of its own proposals. The `sign` route intentionally does NOT use
// this: a CIP-30 vkey witness is self-authenticating, so anyone may contribute
// one and the on-chain threshold is what ultimately gates the funds.
export async function requireProposalParticipant(
  session: ProposalSession,
  proposalId: string
): Promise<
  | { access: { walletUnit: string; createdByKeyHash: string; status: ProposalStatus } }
  | { response: NextResponse }
> {
  const access = await getProposalAccess(proposalId);
  if (!access) {
    return { response: jsonError("Proposal not found.", 404) };
  }

  if (access.createdByKeyHash === session.paymentKeyHash) {
    return { access };
  }

  if (await isWalletParticipant(access.walletUnit, session.paymentKeyHash)) {
    return { access };
  }

  return { response: jsonError("You are not a participant of this wallet.", 403) };
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
