import { NextResponse } from "next/server";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import {
  GOV_ACTION_ID_MISSING_MESSAGE,
  GovernanceActionIdSchema,
  governanceActionPath,
  type GovernanceAction,
  type GovernanceActionsResponseDto
} from "@/lib/api/governance-actions";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { meshHttpStatus } from "@/lib/mesh/http-error";
import { logger, serializeError } from "@/lib/observability/logger";

export const runtime = "nodejs";

// Server-side governance action lookup, backed by Blockfrost, so the vote form can
// show what a pasted id actually is before the wallet votes on it.
//
//   GET /api/v1/governance-actions?id=gov_action1...   (or <tx hash>#<index>)
//
// Wire fields follow Blockfrost's `proposal` and `proposal_metadata` schemas.

type RawProposal = {
  id?: unknown;
  tx_hash?: unknown;
  cert_index?: unknown;
  governance_type?: unknown;
  expiration?: unknown;
  ratified_epoch?: unknown;
  enacted_epoch?: unknown;
  dropped_epoch?: unknown;
  expired_epoch?: unknown;
};

// Only "no such action" is a 404; a 429 or 5xx must not read as "not found".
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

function asEpoch(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** CIP-108 `body.title` / `body.abstract`. Blockfrost may return the document as a string. */
function readCip108(metadataRaw: unknown): { title: string | null; abstract: string | null } {
  let document = asRecord(metadataRaw)?.json_metadata;
  if (typeof document === "string") {
    try {
      document = JSON.parse(document);
    } catch {
      document = null;
    }
  }
  const body = asRecord(asRecord(document)?.body);
  return { title: asText(body?.title), abstract: asText(body?.abstract) };
}

function statusOf(raw: RawProposal): GovernanceAction["status"] {
  if (asEpoch(raw.enacted_epoch) !== null) return "enacted";
  if (asEpoch(raw.ratified_epoch) !== null) return "ratified";
  if (asEpoch(raw.expired_epoch) !== null) return "expired";
  if (asEpoch(raw.dropped_epoch) !== null) return "dropped";
  return "active";
}

export async function GET(request: Request) {
  const limit = await rateLimit(clientKey(request, "governance-actions"), 300, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many governance action lookups. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  const { searchParams } = new URL(request.url);
  const parsed = GovernanceActionIdSchema.safeParse(searchParams.get("id") ?? "");
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? GOV_ACTION_ID_MISSING_MESSAGE;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const provider = getBlockfrostProvider();
    const path = governanceActionPath(parsed.data);
    const [proposalRaw, metadataRaw] = (await Promise.all([
      provider.get(path).catch(nullIfNotFound),
      // The title is optional: a metadata failure must not hide an action that exists.
      provider.get(`${path}/metadata`).catch((error: unknown) => {
        if (meshHttpStatus(error) !== 404) {
          logger.warn("api.governance_action_metadata_failed", { err: serializeError(error) });
        }
        return null;
      })
    ])) as [unknown, unknown];

    const proposal = asRecord(proposalRaw) as RawProposal | null;
    const txHash = asText(proposal?.tx_hash);
    const index = asEpoch(proposal?.cert_index);
    if (!proposal || !txHash || index === null) {
      return NextResponse.json(
        { error: "Governance action not found on this network." },
        { status: 404 }
      );
    }

    const body: GovernanceActionsResponseDto = {
      action: {
        id: asText(proposal.id) ?? parsed.data,
        txHash,
        index,
        type: asText(proposal.governance_type) ?? "unknown",
        ...readCip108(metadataRaw),
        expirationEpoch: asEpoch(proposal.expiration),
        status: statusOf(proposal)
      }
    };
    return NextResponse.json(body);
  } catch (error) {
    logger.error("api.governance_action_lookup_failed", { err: serializeError(error) });
    return NextResponse.json({ error: "Governance action lookup failed." }, { status: 500 });
  }
}
