import { NextResponse } from "next/server";
import { getBlockfrostProvider } from "@/lib/mesh/blockfrost-server";
import {
  STAKE_ADDRESS_MISSING_MESSAGE,
  StakeAddressSchema,
  type AccountsResponseDto
} from "@/lib/api/accounts";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { meshHttpStatus, meshUpstreamFailure } from "@/lib/mesh/http-error";
import { PROVIDER_UNAVAILABLE_MESSAGE } from "@/lib/http/tx-route-errors";
import { logger, serializeError } from "@/lib/observability/logger";

export const runtime = "nodejs";

// Server-side stake account lookup, backed by Blockfrost.
//
//   GET /api/v1/accounts?address=stake1...
//
// Mesh's `fetchAccountInfo` drops `registered` and `drep_id`, and folds delegation into
// `active`, so a delegation form cannot tell from it whether a certificate needs to
// register the address first. This route reads Blockfrost's `account_content` directly.

type RawAccount = {
  registered?: unknown;
  pool_id?: unknown;
  drep_id?: unknown;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(request: Request) {
  const limit = await rateLimit(clientKey(request, "accounts"), 300, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many account lookups. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  const { searchParams } = new URL(request.url);
  const parsed = StakeAddressSchema.safeParse(searchParams.get("address") ?? "");
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? STAKE_ADDRESS_MISSING_MESSAGE;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const raw = await getBlockfrostProvider()
      .get(`/accounts/${parsed.data}`)
      // Blockfrost's spec documents a 404 for an account it has never seen. That address
      // has no registration and no delegation, which is an answer, not an error.
      .catch((error: unknown) => {
        if (meshHttpStatus(error) === 404) return null;
        throw error;
      }) as RawAccount | null;

    const body: AccountsResponseDto = {
      account: {
        stakeAddress: parsed.data,
        registered: raw?.registered === true,
        poolId: asText(raw?.pool_id),
        drepId: asText(raw?.drep_id)
      }
    };
    return NextResponse.json(body);
  } catch (error) {
    logger.error("api.account_lookup_failed", { err: serializeError(error) });
    const upstream = meshUpstreamFailure(error);
    if (upstream) {
      return NextResponse.json(
        { error: PROVIDER_UNAVAILABLE_MESSAGE },
        upstream.status === 429
          ? { status: 429, headers: { "Retry-After": upstream.retryAfterSeconds } }
          : { status: 502 }
      );
    }
    return NextResponse.json({ error: "Account lookup failed." }, { status: 500 });
  }
}
