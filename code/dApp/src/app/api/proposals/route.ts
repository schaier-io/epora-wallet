import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildContextSchema,
  jsonError,
  reconcileBodyHash,
  requireSession,
  txBodyHashSchema,
  unsignedTxHexSchema
} from "@/lib/proposals/api-helpers";
import { rateLimit } from "@/lib/http/rate-limit";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import {
  createProposalRecord,
  isWalletParticipant,
  listProposalRecordsForParticipant,
  ProposalQuotaExceededError
} from "@/lib/proposals/store";
import type { CreateProposalRequest } from "@/lib/proposals/types";
import { InvalidProposalTransactionError } from "@/lib/proposals/serialization";
import {
  assertProposalWalletBinding,
  InvalidProposalBuildContextError
} from "@/lib/proposals/validation";
import {
  DEFAULT_PROPOSAL_PAGE_SIZE,
  MAX_PROPOSAL_PAGE_SIZE,
  MAX_SUMMARY_CELL_LENGTH,
  MAX_SUMMARY_HEADLINE_LENGTH,
  MAX_SUMMARY_ROWS,
  MAX_SUMMARY_BYTES,
  utf8ByteLength
} from "@/lib/proposals/limits";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiProposalsRoute");

export const runtime = "nodejs";

// GET /api/proposals?walletUnit=... — browse proposals visible to the signed-in
// wallet: scoped to wallets it participates in (plus any it created), never the
// whole instance. An optional walletUnit narrows within that visible set.
export async function GET(request: Request) {
  const i18n = await getI18n();
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const query = new URL(request.url).searchParams;
  const walletUnit = query.get("walletUnit")?.trim() || undefined;
  const cursor = query.get("cursor")?.trim() || undefined;
  const parsedLimit = Number(query.get("limit") ?? DEFAULT_PROPOSAL_PAGE_SIZE);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_PROPOSAL_PAGE_SIZE) {
    return jsonError(i18n("limitMustBeBetween1AndMax", { max: MAX_PROPOSAL_PAGE_SIZE }), 400);
  }
  if (walletUnit && walletUnit.length > 120) return jsonError(i18n("walletIdTooLong"), 400);
  if (cursor && cursor.length > 64) return jsonError(i18n("pageCursorTooLong"), 400);

  const limit = await rateLimit(`proposals:list:${auth.session.paymentKeyHash}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: i18n("tooManyProposalListRequestsTryAgainShortly") },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  const page = await listProposalRecordsForParticipant(auth.session.paymentKeyHash, walletUnit, {
    limit: parsedLimit,
    cursor
  });
  return NextResponse.json(page);
}

function createSchema(summaryTooLargeMessage: string) {
  return z.object({
  walletUnit: z.string().trim().min(1).max(120),
  walletPolicyId: z.string().trim().length(56),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  actionKind: z.string().trim().min(1).max(80),
  authorityPath: z.enum(["admin", "multisig"]),
  builder: z.enum([
    "stt-spend",
    "wallet-spend",
    "wallet-withdraw",
    "wallet-publish",
    "wallet-vote",
    "set-intended-stake-credential",
    "consolidate-utxo",
    "lock-funds",
    "mint"
  ]),
  buildContext: buildContextSchema,
  unsignedTxHex: unsignedTxHexSchema,
  txBodyHash: txBodyHashSchema,
  summary: z
    .object({
      headline: z.string().max(MAX_SUMMARY_HEADLINE_LENGTH),
      rows: z
        .array(
          z.object({
            label: z.string().max(MAX_SUMMARY_CELL_LENGTH),
            value: z.string().max(MAX_SUMMARY_CELL_LENGTH)
          })
        )
        .max(MAX_SUMMARY_ROWS)
    })
    .refine(
      (summary) => utf8ByteLength(JSON.stringify(summary)) <= MAX_SUMMARY_BYTES,
      summaryTooLargeMessage
    )
    .optional()
  });
}

// POST /api/proposals — save a built tx as a proposal. The creator is the
// signed-in wallet; the stored body hash is reconciled from the bytes.
export async function POST(request: Request) {
  const i18n = await getI18n();
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const limit = await rateLimit(
      `proposals:create:${auth.session.paymentKeyHash}`,
      30,
      60 * 60 * 1000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: i18n("tooManyProposalsCreatedTryAgainLater") },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    const body = createSchema(
      i18n("summaryExceedsTheMaxSummaryBytesByteProposal", {
        MAX_SUMMARY_BYTES
      })
    ).parse(await readBoundedJson(request));
    assertProposalWalletBinding(body as CreateProposalRequest);
    if (!(await isWalletParticipant(body.walletUnit, auth.session.paymentKeyHash))) {
      return jsonError(i18n("youAreNotParticipant"), 403);
    }
    const request_: CreateProposalRequest = {
      ...body,
      txBodyHash: reconcileBodyHash(body.unsignedTxHex, body.txBodyHash),
      buildContext: body.buildContext as CreateProposalRequest["buildContext"]
    };
    const proposal = await createProposalRecord(request_, auth.session.paymentKeyHash);
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError(error.message, 413);
    }
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? i18n("invalidProposal"), 400);
    }
    if (error instanceof InvalidProposalTransactionError) {
      return jsonError(error.message, 400);
    }
    if (error instanceof InvalidProposalBuildContextError) {
      return jsonError(error.message, 400);
    }
    if (error instanceof ProposalQuotaExceededError) {
      return jsonError(error.message, 429);
    }
    return jsonError(i18n("couldNotSaveProposal"), 500);
  }
}
