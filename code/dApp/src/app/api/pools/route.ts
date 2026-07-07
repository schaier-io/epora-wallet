import { NextResponse } from "next/server";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import { getErrorMessage } from "@/lib/http/errors";

export const runtime = "nodejs";

// Server-side stake-pool lookup, backed by Blockfrost (so the pool id never goes
// to a CORS-blocked third party and the project key stays on the server).
//
//   GET /api/pools?id=pool1...   → one pool's details + metadata (ticker/name)
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json(
      { error: "Provide a pool id, e.g. /api/pools?id=pool1..." },
      { status: 400 }
    );
  }
  // Cheap shape guard before hitting Blockfrost.
  if (!/^pool1[0-9a-z]+$/i.test(id) && !/^[0-9a-f]{56}$/i.test(id)) {
    return NextResponse.json(
      { error: "That doesn't look like a pool id (expected `pool1…` or a 56-char hex id)." },
      { status: 400 }
    );
  }

  try {
    const provider = getBlockfrostProvider();
    const results = (await Promise.all([
      provider.get(`/pools/${id}`).catch(() => null),
      provider.get(`/pools/${id}/metadata`).catch(() => null)
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

    return NextResponse.json({
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
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
