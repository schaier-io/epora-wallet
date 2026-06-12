import { NextResponse } from "next/server";
import { z } from "zod";
import {
  hexSchema,
  jsonError,
  requireSession,
  txBodyHashSchema
} from "@/lib/proposals/api-helpers";
import { getProposalRecord, upsertProposalSignature } from "@/lib/proposals/store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const SignSchema = z.object({
  // CIP-30 vkey witness set hex returned by wallet.signTx(txHex, true).
  witnessSetHex: hexSchema,
  // The body hash the signer believes they signed; rejected if the proposal was
  // rebuilt in the meantime (prevents signing a body you never reviewed).
  txBodyHash: txBodyHashSchema
});

// POST /api/proposals/:id/sign — record the signed-in wallet's witness. The
// witness is stored under the session key hash; its on-chain validity (and thus
// whether it counts toward the threshold) is recomputed from the bytes during
// verification, so a bogus witness simply never satisfies the rule.
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;

  try {
    const body = SignSchema.parse(await request.json());
    const result = await upsertProposalSignature({
      proposalId: id,
      signerKeyHash: auth.session.paymentKeyHash,
      witnessSetHex: body.witnessSetHex,
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
    return jsonError("Could not record the signature.", 500);
  }
}
