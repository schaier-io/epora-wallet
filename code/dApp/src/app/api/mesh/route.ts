import { NextResponse } from "next/server";
import { z } from "zod";
import { executeMeshMethod, getBlockfrostProvider, METHOD_VALUES } from "@/lib/mesh/blockfrost-server";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { logger, serializeError } from "@/lib/observability/logger";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiMeshRoute");

export const runtime = "nodejs";

const RequestSchema = z.object({
  method: z.enum(METHOD_VALUES),
  args: z.array(z.unknown()).max(3).default([])
});

// This proxy is intentionally NOT session-gated: wallet detection and the whole
// client-side transaction-building pipeline (lib/mesh/**) read chain state
// through it before any proposal session exists, so requiring auth would break
// the core flow. Blockfrost preprod data is public, so the real risk is
// quota/billing drain (DoS-by-cost) and SSRF via `get`, both addressed by the
// per-IP rate limit here and the relative-path guard in blockfrost-server.ts.
// Raised 10x from 120/20 on 2026-09-01. Opening or switching a smart wallet is already tens
// of POSTs to this route, because the browser fans out one RPC call per item:
// `use-detected-stt-tokens.ts` fetches one script-UTxO set per smart wallet on the policy,
// and `helpers/transactions.ts` `fetchTransactionsByHash` issues one `fetchTxInfo` per
// transaction hash, which `use-wallet-activity.ts` calls twice per refresh. Ordinary use hit
// the old floor and answered 429 to a user who had clicked twice.
//
// These are per-caller floors, not a Blockfrost quota guarantee: deployment-wide spend is
// bounded by Blockfrost's own limits, and `/api/v1/tx/*` keeps its separate deployment-wide
// ban shield.
const MESH_RATE_LIMIT = 1200;
const MESH_RATE_WINDOW_MS = 60_000;
const EXPENSIVE_METHOD_RATE_LIMIT = 200;
const MAX_MESH_REQUEST_BYTES = 3 * 1024 * 1024;

export async function POST(request: Request) {
  const i18n = await getI18n();
  const callerKey = clientKey(request, "mesh");
  const limit = await rateLimit(callerKey, MESH_RATE_LIMIT, MESH_RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: i18n("tooManyRequestsWaitAMomentThenTry") },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const payloadUnknown: unknown = await readBoundedJson(request, MAX_MESH_REQUEST_BYTES);
    const payload = RequestSchema.parse(payloadUnknown);
    if (payload.method === "evaluateTx" || payload.method === "submitTx") {
      const methodLimit = await rateLimit(
        `${callerKey}:${payload.method}`,
        EXPENSIVE_METHOD_RATE_LIMIT,
        MESH_RATE_WINDOW_MS
      );
      if (!methodLimit.ok) {
        return NextResponse.json(
          { error: i18n("tooManyValue1RequestsPleaseTryAgainShortly", { value1: payload.method }) },
          { status: 429, headers: { "Retry-After": String(methodLimit.retryAfterSeconds) } }
        );
      }
    }
    const provider = getBlockfrostProvider();
    const result: unknown = await executeMeshMethod(provider, payload.method, payload.args);

    return NextResponse.json({ result: result as unknown });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    logger.error("api.mesh_request_failed", { err: serializeError(error) });
    // The build client's error mapper (workspace build-errors.ts) classifies
    // ledger failures — PPViewHashesDontMatch, BabbageOutputTooSmallUTxO, an
    // empty Ogmios ScriptFailures map — by the provider's own response text.
    // Flattening this response to the generic message alone turned every one of
    // those mappings dead: the serialized detail rides along in `details`, and
    // ServerFetcher folds it into the error it throws, while the generic string
    // stays the only user-facing line.
    return NextResponse.json(
      { error: i18n("meshRequestFailed"), details: serializeError(error) },
      { status: 500 }
    );
  }
}
