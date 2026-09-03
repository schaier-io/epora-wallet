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
  isWalletIndexed,
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
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/AppApiProposalsRoute.json";
import { logger, serializeError } from "@/lib/observability/logger";

const i18n = createDefaultTranslator("AppApiProposalsRoute", defaultMessages);

export const runtime = "nodejs";

// GET /api/proposals?walletUnit=...: browse proposals visible to the signed-in
// wallet: scoped to wallets it participates in (plus any it created), never the
// whole instance. An optional walletUnit narrows within that visible set.
export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const query = new URL(request.url).searchParams;
  const walletUnit = query.get("walletUnit")?.trim() || undefined;
  const cursor = query.get("cursor")?.trim() || undefined;
  const parsedLimit = Number(query.get("limit") ?? DEFAULT_PROPOSAL_PAGE_SIZE);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_PROPOSAL_PAGE_SIZE) {
    return jsonError(i18n("limitMustBeBetween1AndMaxProposal", { MAX_PROPOSAL_PAGE_SIZE }), 400);
  }
  if (walletUnit && walletUnit.length > 120) return jsonError(i18n("walletunitIsTooLong"), 400);
  if (cursor && cursor.length > 64) return jsonError(i18n("cursorIsTooLong"), 400);

  const limit = await rateLimit(`proposals:list:${auth.session.paymentKeyHash}`, 600, 60_000);
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

const CreateSchema = z.object({
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
      i18n("summaryExceedsTheMaxSummaryBytesByteProposal", { MAX_SUMMARY_BYTES: MAX_SUMMARY_BYTES })
    )
    .optional()
});

// POST /api/proposals: save a built tx as a proposal. The creator is the
// signed-in wallet; the stored body hash is reconciled from the bytes.
export async function POST(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const limit = await rateLimit(
      `proposals:create:${auth.session.paymentKeyHash}`,
      300,
      60 * 60 * 1000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: i18n("tooManyProposalsCreatedTryAgainLater") },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    const body = CreateSchema.parse(await readBoundedJson(request));
    assertProposalWalletBinding(body as CreateProposalRequest);
    // Two states, two answers. `isWalletParticipant` reads the chain indexer, and a
    // missing row means either "not a member" or "this wallet has not been indexed
    // yet". Answering both with "You are not a participant of this wallet." asserts
    // something the server does not know, and it lands hardest on the owner of a
    // freshly-minted wallet -- the person whose first proposal has to succeed. The
    // membership check itself stays: the caller's claim to the wallet is exactly what
    // is unverified here, so it cannot be waived without letting a stranger file
    // proposals against someone else's wallet.
    if (!(await isWalletParticipant(body.walletUnit, auth.session.paymentKeyHash))) {
      if (!(await isWalletIndexed(body.walletUnit))) {
        return jsonError(
          i18n("thisWalletHasNotBeenIndexedYetWait"),
          409
        );
      }
      return jsonError(i18n("youAreNotAParticipantOfThisWallet"), 403);
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
      return jsonError(error.issues[0]?.message ?? "Invalid proposal.", 400);
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
    // The masked 500 gave a production failure (a void-typed advisory-lock query
    // Prisma could not deserialize) nowhere to be read from. Log the real error
    // the way /api/mesh does; the caller still gets only the generic copy.
    logger.error("api.proposals_create_failed", { err: serializeError(error) });
    return jsonError(i18n("couldNotSaveTheProposal"), 500);
  }
}
