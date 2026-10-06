import { NextResponse } from "next/server";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import { PoolSearchQuerySchema, type PoolSearchResponseDto } from "@/lib/api";
import { getPoolIndex, PoolIndexBackoffError, searchPools, shortlistPools } from "@/lib/pools/pool-index";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { meshUpstreamFailure } from "@/lib/mesh/http-error";
import { PROVIDER_UNAVAILABLE_MESSAGE } from "@/lib/http/tx-route-errors";
import { logger, serializeError } from "@/lib/observability/logger";

export const runtime = "nodejs";

//   GET /api/v1/pools/search?q=EPORA   → pools whose ticker, name or id matches
//   GET /api/v1/pools/search           → a random shortlist of open pools
//
// Backed by a cached index of every pool (`lib/pools/pool-index.ts`), because
// Blockfrost cannot search by ticker or name.

export async function GET(request: Request) {
  // Same bucket as the exact lookup: the finder spends both from one budget.
  const limit = await rateLimit(clientKey(request, "pools"), 300, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many pool lookups. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  const { searchParams } = new URL(request.url);
  const parsed = PoolSearchQuerySchema.safeParse({ q: searchParams.get("q") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "The search text is too long." }, { status: 400 });
  }

  try {
    const provider = getBlockfrostProvider();
    const index = await getPoolIndex((path) => provider.get(path));
    const query = parsed.data.q ?? "";
    const body: PoolSearchResponseDto = {
      pools: query ? searchPools(index, query) : shortlistPools(index)
    };
    return NextResponse.json(body);
  } catch (error) {
    // A replay during the backoff answers as the failed build did, but was logged then,
    // and its Retry-After is the time left before the next build.
    const backoff = error instanceof PoolIndexBackoffError ? error : null;
    if (!backoff) logger.error("api.pool_search_failed", { err: serializeError(error) });
    const upstream = meshUpstreamFailure(backoff ? backoff.cause : error);
    if (upstream) {
      return NextResponse.json(
        { error: PROVIDER_UNAVAILABLE_MESSAGE },
        upstream.status === 429
          ? {
              status: 429,
              headers: {
                "Retry-After": backoff ? String(backoff.retryAfterSeconds) : upstream.retryAfterSeconds
              }
            }
          : { status: 502 }
      );
    }
    return NextResponse.json({ error: "Pool search failed." }, { status: 500 });
  }
}
