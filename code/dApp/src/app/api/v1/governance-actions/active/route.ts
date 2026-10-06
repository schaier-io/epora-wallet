import { NextResponse } from "next/server";
import type { ActiveGovernanceActionsResponseDto } from "@/lib/api/governance-actions";
import { fetchActiveGovernanceActions, KoiosProposalsError } from "@/lib/governance/koios-proposals";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { PROVIDER_UNAVAILABLE_MESSAGE } from "@/lib/http/tx-route-errors";
import { UPSTREAM_RETRY_AFTER_FALLBACK_SECONDS } from "@/lib/mesh/http-error";
import { logger, serializeError } from "@/lib/observability/logger";

export const runtime = "nodejs";

// Every governance action open for votes, so the vote form can offer them to pick from.
// Backed by Koios, which returns status epochs and CIP-108 metadata in one list call.
//
//   GET /api/v1/governance-actions/active

export async function GET(request: Request) {
  // Shares the lookup route's bucket: both read the same governance data for one form.
  const limit = await rateLimit(clientKey(request, "governance-actions"), 300, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many governance action lookups. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const body: ActiveGovernanceActionsResponseDto = { actions: await fetchActiveGovernanceActions() };
    return NextResponse.json(body);
  } catch (error) {
    logger.error("api.governance_actions_active_failed", { err: serializeError(error) });
    if (error instanceof KoiosProposalsError && error.status === 429) {
      return NextResponse.json(
        { error: PROVIDER_UNAVAILABLE_MESSAGE },
        { status: 429, headers: { "Retry-After": error.retryAfter ?? String(UPSTREAM_RETRY_AFTER_FALLBACK_SECONDS) } }
      );
    }
    return NextResponse.json({ error: PROVIDER_UNAVAILABLE_MESSAGE }, { status: 502 });
  }
}
