import { NextResponse } from "next/server";
import { z } from "zod";
import { executeMeshMethod, getBlockfrostProvider, METHOD_VALUES, MeshRpcInputError } from "@/lib/mesh/blockfrost-server";
import { isScriptEvaluationRejection, meshHttpRetryAfter, meshHttpStatus, meshUpstreamFailure } from "@/lib/mesh/http-error";
import { retryMeshRead, meshReadRetryDelay } from "@/lib/mesh/read-retry";
import { parseRetryAfterMs } from "@/lib/http/retry-after";
import { clientKey, rateLimit, rateLimitPair } from "@/lib/http/rate-limit";
import { InvalidJsonError, readBoundedJson, RequestBodyTooDeepError, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { logger, serializeError, serializeErrorDetail } from "@/lib/observability/logger";
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
// and wallet activity reads one `fetchTxInfo` per anchor transaction. Ordinary use hit
// the old floor and answered 429 to a user who had clicked twice.
//
// These are per-caller floors, not a Blockfrost quota guarantee: deployment-wide spend is
// bounded by Blockfrost's own limits, and `/api/v1/tx/*` keeps its separate deployment-wide
// ban shield.
const MESH_RATE_LIMIT = 2400;
const MESH_RATE_WINDOW_MS = 60_000;
const EXPENSIVE_METHOD_RATE_LIMIT = 400;
const MAX_MESH_REQUEST_BYTES = 3 * 1024 * 1024;

type RequestTimings = { rate_limit: number; provider: number };

/** Expose durations only. Each response keeps its own request timing state. */
export async function POST(request: Request) {
  const started = performance.now();
  const timings: RequestTimings = { rate_limit: 0, provider: 0 };
  const response = await handlePost(request, timings);
  response.headers.set("Server-Timing", [
    `rate_limit;dur=${timings.rate_limit.toFixed(1)}`,
    `provider;dur=${timings.provider.toFixed(1)}`,
    `total;dur=${(performance.now() - started).toFixed(1)}`
  ].join(", "));
  return response;
}

/** Proxy chain methods with bounded retries and provider error details. */
async function handlePost(request: Request, timings: RequestTimings) {
  const i18n = await getI18n();
  const callerKey = clientKey(request, "mesh");
  const hint = request.headers.get("X-Mesh-Method");
  const hintedMethod = hint === "evaluateTx" || hint === "submitTx" ? hint : undefined;
  // Named outside the try so failures identify the actual parsed method.
  let method: string | undefined;
  const measure = async <T,>(field: keyof RequestTimings, operation: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try { return await operation(); }
    finally { timings[field] += performance.now() - started; }
  };

  try {
    // A hint can only add a debit. A missing or different actual method keeps
    // the original method check after bounded parsing.
    const initial = await measure("rate_limit", () => hintedMethod
      ? rateLimitPair(
        { key: callerKey, limit: MESH_RATE_LIMIT, windowMs: MESH_RATE_WINDOW_MS },
        { key: `${callerKey}:${hintedMethod}`, limit: EXPENSIVE_METHOD_RATE_LIMIT, windowMs: MESH_RATE_WINDOW_MS }
      )
      : rateLimit(callerKey, MESH_RATE_LIMIT, MESH_RATE_WINDOW_MS).then(primary => ({ primary, secondary: undefined })));
    if (!initial.primary.ok) {
      return NextResponse.json(
        { error: i18n("tooManyRequestsWaitAMomentThenTry") },
        { status: 429, headers: { "Retry-After": String(initial.primary.retryAfterSeconds) } }
      );
    }
    const payloadUnknown: unknown = await readBoundedJson(request, MAX_MESH_REQUEST_BYTES);
    const payload = RequestSchema.parse(payloadUnknown);
    method = payload.method;
    if (payload.method === "evaluateTx" || payload.method === "submitTx") {
      const methodLimit = payload.method === hintedMethod ? initial.secondary
        : await measure("rate_limit", () => rateLimit(
          `${callerKey}:${payload.method}`,
          EXPENSIVE_METHOD_RATE_LIMIT,
          MESH_RATE_WINDOW_MS
        ));
      if (!methodLimit) throw new Error("The method rate-limit result is missing.");
      if (!methodLimit.ok) {
        return NextResponse.json(
          { error: i18n("tooManyValue1RequestsPleaseTryAgainShortly", { value1: payload.method }) },
          { status: 429, headers: { "Retry-After": String(methodLimit.retryAfterSeconds) } }
        );
      }
    }
    const provider = getBlockfrostProvider();
    const result: unknown = await measure("provider", () => retryMeshRead(
      payload.method,
      () => executeMeshMethod(provider, payload.method, payload.args),
      (error, attempt) => {
        const status = meshHttpStatus(error);
        if (status === null || ![500, 502, 503, 504].includes(status)) return undefined;
        return parseRetryAfterMs(meshHttpRetryAfter(error)) ?? meshReadRetryDelay(attempt);
      },
      request.signal
    ));

    return NextResponse.json({ result: result as unknown });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof z.ZodError || error instanceof MeshRpcInputError || error instanceof InvalidJsonError || error instanceof RequestBodyTooDeepError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const upstreamStatus = meshHttpStatus(error);
    const retryAfter = meshHttpRetryAfter(error);
    // A validator refusing the caller's transaction is a caller-side outcome,
    // not a server fault: it must not raise an error event, and the response
    // must not claim 500. The warn line keeps the pattern visible in the
    // platform logs, and `method` makes a genuine evaluator regression
    // diagnosable.
    const scriptRejection = isScriptEvaluationRejection(error);
    if (scriptRejection) {
      logger.warn("api.mesh_script_evaluation_rejected", { method, err: serializeError(error) });
    // Blockfrost answers 404 for a tx hash it has not indexed yet, and the
    // browser polls pending submissions every 2 seconds: without this skip,
    // every poll becomes a Sentry event. The 404 response below already
    // carries the status and detail; every other status keeps its error log.
    } else if (upstreamStatus !== 404) {
      logger.error("api.mesh_request_failed", { method, err: serializeError(error) });
    }
    // The build client's error mapper (workspace build-errors.ts) classifies
    // ledger failures — PPViewHashesDontMatch, BabbageOutputTooSmallUTxO, an
    // empty Ogmios ScriptFailures map — by the provider's own response text.
    // Flattening this response to the generic message alone turned every one of
    // those mappings dead: the detail rides along in `details`, and
    // ServerFetcher folds it into the error it throws, while the generic string
    // stays the only user-facing line. The detail is the stack-free shape
    // (serializeErrorDetail): this route is public and not session-gated, so a
    // stack's server file paths must not leave the server.
    return NextResponse.json(
      { error: i18n("meshRequestFailed"), details: serializeErrorDetail(error) },
      {
        status: meshUpstreamFailure(error)?.status ?? upstreamStatus
          ?? (error instanceof Error && error.name === "TimeoutError" ? 502 : scriptRejection ? 422 : 500),
        ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {})
      }
    );
  }
}
