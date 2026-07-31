import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PROPOSAL_SESSION_COOKIE, verifySessionCookieValue, type ProposalSession } from "./auth";
import { reconcileProposalBodyHash } from "./serialization";
import { getProposalAccess, isWalletParticipant } from "./store";
import type { ProposalStatus } from "./types";
import {
  MAX_BUILD_CONTEXT_BYTES,
  MAX_BUILD_CONTEXT_DEPTH,
  MAX_UNSIGNED_TX_BYTES,
  MAX_WITNESS_SET_BYTES,
  jsonDepthWithin,
  utf8ByteLength
} from "./limits";

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
// locked out of its own proposals.
export async function requireProposalParticipant(
  session: ProposalSession,
  proposalId: string
): Promise<
  | {
      access: {
        walletUnit: string;
        walletPolicyId: string;
        createdByKeyHash: string;
        status: ProposalStatus;
        txBodyHash: string;
      };
    }
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

export function reconcileBodyHash(txHex: string, claimedBodyHash: string): string {
  return reconcileProposalBodyHash(txHex, claimedBodyHash);
}

const HEX = /^[0-9a-fA-F]+$/;

export const txBodyHashSchema = z
  .string()
  .trim()
  .length(64)
  .regex(HEX, "Expected a 64-character hex tx body hash.");

export const hexSchema = z.string().trim().min(1).regex(HEX, "Expected a hex string.");

export const unsignedTxHexSchema = hexSchema.max(
  MAX_UNSIGNED_TX_BYTES * 2,
  `Transaction exceeds the ${MAX_UNSIGNED_TX_BYTES}-byte proposal limit.`
);

export const witnessSetHexSchema = hexSchema.max(
  MAX_WITNESS_SET_BYTES * 2,
  `Witness set exceeds the ${MAX_WITNESS_SET_BYTES}-byte proposal limit.`
);

// The route schema preserves builder-specific fields. The proposal validation
// boundary then checks the wallet identity and state-input fields it relies on.
export const buildContextSchema = z
  .object({ builder: z.string().trim().min(1) })
  .passthrough()
  .superRefine((value, context) => {
    if (!jsonDepthWithin(value, MAX_BUILD_CONTEXT_DEPTH)) {
      context.addIssue({
        code: "custom",
        message: `Build context exceeds the maximum nesting depth of ${MAX_BUILD_CONTEXT_DEPTH}.`
      });
      return;
    }
    if (utf8ByteLength(JSON.stringify(value)) > MAX_BUILD_CONTEXT_BYTES) {
      context.addIssue({
        code: "custom",
        message: `Build context exceeds the ${MAX_BUILD_CONTEXT_BYTES}-byte proposal limit.`
      });
    }
  });
