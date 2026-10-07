import { NextResponse } from "next/server";
import { DrepSearchQuerySchema, type DrepSearchResponseDto } from "@/lib/api/dreps";
import {
  DREP_INDEX_RETRY_MS,
  DrepIndexBackoffError,
  getDrepIndex,
  KoiosDrepsError,
  searchDreps,
  shortlistDreps
} from "@/lib/governance/drep-index";
import { koiosDrepCall } from "@/lib/governance/koios-dreps";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { PROVIDER_UNAVAILABLE_MESSAGE } from "@/lib/http/tx-route-errors";
import { logger, serializeError } from "@/lib/observability/logger";

export const runtime = "nodejs";

//   GET /api/v1/dreps/search?q=name   → registered DReps whose name or id matches
//   GET /api/v1/dreps/search          → a random shortlist of active, named DReps
//
// Backed by a cached index of every registered DRep (`lib/governance/drep-index.ts`),
// because Blockfrost cannot search DReps by name.

export async function GET(request: Request) {
  // Same bucket as the exact lookup: the form spends both from one budget.
  const limit = await rateLimit(clientKey(request, "dreps"), 300, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many DRep lookups. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  const { searchParams } = new URL(request.url);
  const parsed = DrepSearchQuerySchema.safeParse({ q: searchParams.get("q") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "The search text is too long." }, { status: 400 });
  }

  try {
    const index = await getDrepIndex(koiosDrepCall);
    const query = parsed.data.q ?? "";
    const body: DrepSearchResponseDto = {
      dreps: query ? searchDreps(index, query) : shortlistDreps(index)
    };
    return NextResponse.json(body);
  } catch (error) {
    // A replay during the backoff answers as the failed build did, but was logged then,
    // and its Retry-After is the time left before the next build.
    const backoff = error instanceof DrepIndexBackoffError ? error : null;
    if (!backoff) logger.error("api.drep_search_failed", { err: serializeError(error) });
    const cause = backoff ? backoff.cause : error;
    if (cause instanceof KoiosDrepsError && cause.status === 429) {
      const retryAfter = backoff
        ? backoff.retryAfterSeconds
        : Math.max(Number(cause.retryAfter) || 0, DREP_INDEX_RETRY_MS / 1000);
      return NextResponse.json(
        { error: PROVIDER_UNAVAILABLE_MESSAGE },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    // Koios answered with an error or a body that is not JSON, or could not be reached in
    // time: the provider is down. Anything else is this route's own bug.
    const unreachable = cause instanceof KoiosDrepsError || cause instanceof TypeError ||
      cause instanceof SyntaxError || (cause instanceof DOMException && cause.name === "TimeoutError");
    if (unreachable) return NextResponse.json({ error: PROVIDER_UNAVAILABLE_MESSAGE }, { status: 502 });
    return NextResponse.json({ error: "DRep search failed." }, { status: 500 });
  }
}
