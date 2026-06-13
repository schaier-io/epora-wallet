import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildContextSchema,
  hexSchema,
  jsonError,
  reconcileBodyHash,
  requireSession,
  txBodyHashSchema
} from "@/lib/proposals/api-helpers";
import { createProposalRecord, listProposalRecordsForParticipant } from "@/lib/proposals/store";
import type { CreateProposalRequest } from "@/lib/proposals/types";

export const runtime = "nodejs";

// GET /api/proposals?walletUnit=... — browse proposals visible to the signed-in
// wallet: scoped to wallets it participates in (plus any it created), never the
// whole instance. An optional walletUnit narrows within that visible set.
export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const walletUnit = new URL(request.url).searchParams.get("walletUnit")?.trim() || undefined;
  const proposals = await listProposalRecordsForParticipant(auth.session.paymentKeyHash, walletUnit);
  return NextResponse.json({ proposals });
}

const CreateSchema = z.object({
  walletUnit: z.string().trim().min(1),
  walletPolicyId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  actionKind: z.string().trim().min(1),
  authorityPath: z.enum(["admin", "multisig"]),
  builder: z.enum([
    "stt-spend",
    "wallet-spend",
    "wallet-withdraw",
    "wallet-publish",
    "wallet-propose",
    "set-intended-stake-credential",
    "consolidate-utxo",
    "lock-funds",
    "mint"
  ]),
  buildContext: buildContextSchema,
  unsignedTxHex: hexSchema,
  txBodyHash: txBodyHashSchema,
  summary: z
    .object({
      headline: z.string(),
      rows: z.array(z.object({ label: z.string(), value: z.string() }))
    })
    .optional()
});

// POST /api/proposals — save a built tx as a proposal. The creator is the
// signed-in wallet; the stored body hash is reconciled from the bytes.
export async function POST(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = CreateSchema.parse(await request.json());
    const request_: CreateProposalRequest = {
      ...body,
      txBodyHash: reconcileBodyHash(body.unsignedTxHex, body.txBodyHash),
      buildContext: body.buildContext as CreateProposalRequest["buildContext"]
    };
    const proposal = await createProposalRecord(request_, auth.session.paymentKeyHash);
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid proposal.", 400);
    }
    return jsonError("Could not save the proposal.", 500);
  }
}
