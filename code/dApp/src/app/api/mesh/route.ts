import { NextResponse } from "next/server";
import { z } from "zod";
import { executeMeshMethod, getBlockfrostProvider, METHOD_VALUES } from "@/lib/mesh/blockfrost-server";
import { getErrorMessage, serializeErrorForResponse } from "@/lib/http/errors";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";

export const runtime = "nodejs";

const RequestSchema = z.object({
  method: z.enum(METHOD_VALUES),
  args: z.array(z.unknown()).default([])
});

// This proxy is intentionally NOT session-gated: wallet detection and the whole
// client-side transaction-building pipeline (lib/mesh/**) read chain state
// through it before any proposal session exists, so requiring auth would break
// the core flow. Blockfrost preprod data is public, so the real risk is
// quota/billing drain (DoS-by-cost) and SSRF via `get` — addressed by the
// per-IP rate limit here and the relative-path guard in blockfrost-server.ts.
const MESH_RATE_LIMIT = 120;
const MESH_RATE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "mesh"), MESH_RATE_LIMIT, MESH_RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const payloadUnknown: unknown = await request.json();
    const payload = RequestSchema.parse(payloadUnknown);
    const provider = getBlockfrostProvider();
    const result: unknown = await executeMeshMethod(provider, payload.method, payload.args);

    return NextResponse.json({ result: result as unknown });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error), details: serializeErrorForResponse(error) },
      { status: 500 }
    );
  }
}
