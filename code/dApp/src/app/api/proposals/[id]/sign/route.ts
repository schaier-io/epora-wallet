import { NextResponse } from "next/server";
import { z } from "zod";
import {
  hexSchema,
  jsonError,
  requireProposalParticipant,
  requireSession,
  txBodyHashSchema
} from "@/lib/proposals/api-helpers";
import { getProposalRecord, upsertProposalSignature } from "@/lib/proposals/store";
import {
  InvalidProposalWitnessError,
  validateVKeyWitnessSet
} from "@/lib/proposals/witness-validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const SignSchema = z.object({
  // CIP-30 vkey witness set hex returned by wallet.signTx(txHex, true).
  witnessSetHex: hexSchema,
  // The body hash the signer believes they signed; rejected if the proposal was
  // rebuilt in the meantime (prevents signing a body you never reviewed).
  txBodyHash: txBodyHashSchema
});

// POST /api/proposals/:id/sign — validate and record a wallet participant's
// witness for the exact current transaction body.
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const access = await requireProposalParticipant(auth.session, id);
  if ("response" in access) {
    return access.response;
  }

  try {
    const body = SignSchema.parse(await request.json());
    const validated = validateVKeyWitnessSet({
      witnessSetHex: body.witnessSetHex,
      txBodyHash: body.txBodyHash,
      signerKeyHash: auth.session.paymentKeyHash
    });
    const result = await upsertProposalSignature({
      proposalId: id,
      signerKeyHash: auth.session.paymentKeyHash,
      witnessSetHex: validated.witnessSetHex,
      expectedBodyHash: body.txBodyHash
    });
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    const proposal = await getProposalRecord(id);
    return NextResponse.json({ proposal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid signature payload.", 400);
    }
    if (error instanceof InvalidProposalWitnessError) {
      return jsonError(error.message, 400);
    }
    return jsonError("Could not record the signature.", 500);
  }
}
