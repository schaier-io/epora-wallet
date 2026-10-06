import { NextResponse } from "next/server";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import {
  DREP_ID_INVALID_MESSAGE,
  DREP_ID_MISSING_MESSAGE,
  DrepIdSchema,
  type DrepsResponseDto
} from "@/lib/api/dreps";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { meshHttpStatus, meshUpstreamFailure } from "@/lib/mesh/http-error";
import { PROVIDER_UNAVAILABLE_MESSAGE } from "@/lib/http/tx-route-errors";
import { logger, serializeError } from "@/lib/observability/logger";

export const runtime = "nodejs";

// Server-side DRep lookup, backed by Blockfrost, so the voting-delegate form can show
// who a pasted id is before the wallet delegates its voting power to it.
//
//   GET /api/v1/dreps?id=drep1...
//
// Wire fields follow Blockfrost's `drep` and `drep_metadata` schemas. Blockfrost has no
// name search, so the form takes an id, as the pool finder does.

type RawDrep = {
  drep_id?: unknown;
  amount?: unknown;
  has_script?: unknown;
  retired?: unknown;
  expired?: unknown;
};

// Only "no such DRep" is a 404; a 429 or 5xx must not read as "not found".
function nullIfNotFound(error: unknown): null {
  if (meshHttpStatus(error) === 404) return null;
  throw error;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * CIP-119 `body.givenName`. Blockfrost may return the document as a string, and some
 * publishers wrap the value as JSON-LD `{ "@value": … }`.
 */
function readGivenName(metadataRaw: unknown): string | null {
  let document = asRecord(metadataRaw)?.json_metadata;
  if (typeof document === "string") {
    try {
      document = JSON.parse(document);
    } catch {
      document = null;
    }
  }
  const givenName = asRecord(asRecord(document)?.body)?.givenName;
  return asText(givenName) ?? asText(asRecord(givenName)?.["@value"]);
}

function statusOf(raw: RawDrep): DrepsResponseDto["drep"]["status"] {
  if (raw.retired === true) return "retired";
  if (raw.expired === true) return "inactive";
  return "active";
}

export async function GET(request: Request) {
  const limit = await rateLimit(clientKey(request, "dreps"), 300, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many DRep lookups. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  const { searchParams } = new URL(request.url);
  const parsed = DrepIdSchema.safeParse(searchParams.get("id") ?? "");
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? DREP_ID_MISSING_MESSAGE;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const provider = getBlockfrostProvider();
    const path = `/governance/dreps/${parsed.data}`;
    const [drepRaw, metadataRaw] = (await Promise.all([
      provider.get(path).catch(nullIfNotFound),
      // The name is optional: a metadata failure must not hide a DRep that exists.
      provider.get(`${path}/metadata`).catch((error: unknown) => {
        if (meshHttpStatus(error) !== 404) {
          logger.warn("api.drep_metadata_failed", { err: serializeError(error) });
        }
        return null;
      })
    ])) as [unknown, unknown];

    const drep = asRecord(drepRaw) as RawDrep | null;
    if (!drep) {
      return NextResponse.json({ error: "DRep not found on this network." }, { status: 404 });
    }

    const body: DrepsResponseDto = {
      drep: {
        drepId: asText(drep.drep_id) ?? parsed.data,
        name: readGivenName(metadataRaw),
        votingPowerLovelace: typeof drep.amount === "string" && /^\d+$/.test(drep.amount) ? drep.amount : null,
        hasScript: drep.has_script === true,
        status: statusOf(drep)
      }
    };
    return NextResponse.json(body);
  } catch (error) {
    // The shape check cannot verify a bech32 checksum; Blockfrost's 400 is the verdict on it.
    if (meshHttpStatus(error) === 400) {
      return NextResponse.json({ error: DREP_ID_INVALID_MESSAGE }, { status: 400 });
    }
    logger.error("api.drep_lookup_failed", { err: serializeError(error) });
    const upstream = meshUpstreamFailure(error);
    if (upstream) {
      return NextResponse.json(
        { error: PROVIDER_UNAVAILABLE_MESSAGE },
        upstream.status === 429
          ? { status: 429, headers: { "Retry-After": upstream.retryAfterSeconds } }
          : { status: 502 }
      );
    }
    return NextResponse.json({ error: "DRep lookup failed." }, { status: 500 });
  }
}
