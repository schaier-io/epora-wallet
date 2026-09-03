import { NextResponse } from "next/server";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import {
  PoolIdSchema,
  POOL_ID_INVALID_MESSAGE,
  POOL_ID_MISSING_MESSAGE,
  type PoolsResponseDto
} from "@/lib/api";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { meshHttpStatus } from "@/lib/mesh/http-error";
import { logger, serializeError } from "@/lib/observability/logger";

export const runtime = "nodejs";

// Server-side stake-pool lookup, backed by Blockfrost (so the pool id never goes
// to a CORS-blocked third party and the project key stays on the server).
//
//   GET /api/v1/pools?id=pool1...   → one pool's details + metadata (ticker/name)
//
// Blockfrost has no ticker search, so the finder takes a pool id (bech32
// `pool1...`, the format every pool explorer shows) and verifies it here.

type RawPoolInfo = {
  pool_id?: string;
  active_stake?: string;
  live_stake?: string;
  live_saturation?: number;
  declared_pledge?: string;
  live_pledge?: string;
  margin_cost?: number;
  fixed_cost?: string;
  blocks_minted?: number;
  retirement?: unknown[];
};

type RawPoolMetadata = {
  ticker?: string | null;
  name?: string | null;
  homepage?: string | null;
  description?: string | null;
};

// Only "no such pool" is a 404; a 429 or 5xx must not read as "not found".
function nullIfNotFound(error: unknown): null {
  if (meshHttpStatus(error) === 404) return null;
  throw error;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export async function GET(request: Request) {
  const limit = await rateLimit(clientKey(request, "pools"), 300, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many pool lookups. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: POOL_ID_MISSING_MESSAGE }, { status: 400 });
  }
  // Cheap shape guard before hitting Blockfrost. Same two messages as before,
  // now quoted from one place.
  if (!PoolIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: POOL_ID_INVALID_MESSAGE }, { status: 400 });
  }

  try {
    const provider = getBlockfrostProvider();
    const results = (await Promise.all([
      provider.get(`/pools/${id}`).catch(nullIfNotFound),
      provider.get(`/pools/${id}/metadata`).catch(nullIfNotFound)
    ])) as [unknown, unknown];
    const infoRaw = results[0];
    const metadataRaw = results[1];

    const info = asRecord(infoRaw) as RawPoolInfo | null;
    if (!info) {
      return NextResponse.json(
        { error: "Pool not found or not registered on this network." },
        { status: 404 }
      );
    }
    const metadata = (asRecord(metadataRaw) ?? {}) as RawPoolMetadata;

    const body: PoolsResponseDto = {
      pool: {
        poolId: info.pool_id ?? id,
        ticker: metadata.ticker ?? null,
        name: metadata.name ?? null,
        homepage: metadata.homepage ?? null,
        description: metadata.description ?? null,
        // Saturation comes back as a fraction (1 = 100%).
        saturation: typeof info.live_saturation === "number" ? info.live_saturation : null,
        liveStakeLovelace: info.live_stake ?? null,
        activeStakeLovelace: info.active_stake ?? null,
        declaredPledgeLovelace: info.declared_pledge ?? null,
        livePledgeLovelace: info.live_pledge ?? null,
        marginPct: typeof info.margin_cost === "number" ? info.margin_cost : null,
        fixedCostLovelace: info.fixed_cost ?? null,
        blocksMinted: typeof info.blocks_minted === "number" ? info.blocks_minted : null,
        retiring: Array.isArray(info.retirement) && info.retirement.length > 0
      }
    };
    return NextResponse.json(body);
  } catch (error) {
    logger.error("api.pool_lookup_failed", { err: serializeError(error) });
    return NextResponse.json({ error: "Pool lookup failed." }, { status: 500 });
  }
}
