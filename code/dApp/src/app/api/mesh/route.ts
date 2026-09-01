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
// Raised 10x from 120/20 on 2026-09-01. One wallet switch, one balance refresh or one
// transaction build is tens of chain reads through this proxy, so ordinary use was hitting
// the old floor and answering 429 to a user who had clicked twice. These are per-caller
// floors, not a Blockfrost quota guarantee: the deployment-wide spend is bounded by
// Blockfrost's own limits, and `/api/v1/tx/*` keeps its separate deployment-wide ban shield.
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
    return NextResponse.json({ error: i18n("meshRequestFailed") }, { status: 500 });
  }
}
