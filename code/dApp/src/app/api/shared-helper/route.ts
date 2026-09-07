import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { SHARED_HELPER_UNAVAILABLE_CODE } from "@/lib/http/errors";
import { resolveSharedSttReferenceServer } from "@/lib/mesh/shared-stt-reference-server";
import { logger, serializeError } from "@/lib/observability/logger";

export const runtime = "nodejs";
const REQUESTS_PER_MINUTE = 30;
const WINDOW_MS = 60_000;
const RATE_LIMITED_CODE = "RATE_LIMITED";

export async function GET(request: Request) {
  try {
    const limit = await rateLimit(clientKey(request, "shared-helper"), REQUESTS_PER_MINUTE, WINDOW_MS);
    if (!limit.ok) {
      return NextResponse.json({ error: RATE_LIMITED_CODE }, {
        status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) }
      });
    }
    const result = await resolveSharedSttReferenceServer();
    return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("api.shared_helper_failed", { err: serializeError(error) });
    return NextResponse.json({ error: SHARED_HELPER_UNAVAILABLE_CODE }, { status: 503 });
  }
}
