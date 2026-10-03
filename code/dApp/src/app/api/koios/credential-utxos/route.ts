import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { NextResponse } from "next/server";
import {
  fetchKoiosCredentialUtxoRows,
  isKoiosNetwork,
  KoiosCredentialLookupError
} from "@/lib/discovery/koios-server";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { logger, serializeError } from "@/lib/observability/logger";
import { UPSTREAM_RETRY_AFTER_FALLBACK_SECONDS } from "@/lib/mesh/http-error";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiKoiosCredentialUtxosRoute");

export const runtime = "nodejs";

// Server-side proxy for Koios `credential_utxos`.
//
// Koios's public API does NOT send an `access-control-allow-origin` header, so a
// browser cannot read it cross-origin, so every client-side fetch fails with
// "TypeError: Failed to fetch" (verified: Blockfrost/GitHub return `*` and work
// in-browser; koios.rest returns no ACAO and fails for every origin, not just a
// sandbox). The server has no such restriction, so we proxy the one call the
// orphan / stake-address ("Franken" UTxO) discovery needs.
//
//   POST /api/koios/credential-utxos  { paymentCredential: "<56-hex>", network? }
//     (`network`, when sent, must equal the deployment's own network)
//     → Koios `credential_utxos` rows (passed through; the client maps them)
//
// Trade-off vs. the old direct-from-browser design: the app server now sees the
// queried payment credential. Acceptable, because the call simply does not work from
// the browser otherwise.

export async function POST(request: Request) {
  const i18n = await getI18n();
  const limit = await rateLimit(clientKey(request, "koios-credential-utxos"), 300, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: i18n("tooManyCredentialLookupsTryAgainShortly") },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  let payload: unknown;
  try {
    payload = await readBoundedJson(request, 2 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: i18n("invalidJsonBody") }, { status: 400 });
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return NextResponse.json({ error: i18n("invalidJsonBody") }, { status: 400 });
  }
  const body = payload as { paymentCredential?: unknown; network?: unknown };

  const paymentCredential =
    typeof body.paymentCredential === "string" ? body.paymentCredential.trim() : "";
  // The deployment decides the network. A client may still name it, but only as a check:
  // letting the body choose sent a preprod deployment's lookups to mainnet Koios.
  const requestedNetwork = typeof body.network === "string" ? body.network.trim() : "";
  if (requestedNetwork && requestedNetwork !== CARDANO_NETWORK) {
    return NextResponse.json(
      { error: i18n("unknownNetworkExpectedPreprodPreviewOrMainnet") },
      { status: 400 }
    );
  }
  const network = CARDANO_NETWORK;

  if (!paymentCredential) {
    return NextResponse.json(
      { error: i18n("provideAPaymentcredential28ByteBlake2b224Hash") },
      { status: 400 }
    );
  }
  // Cheap shape guard before hitting Koios.
  if (!/^[0-9a-f]{56}$/i.test(paymentCredential)) {
    return NextResponse.json(
      { error: i18n("paymentcredentialMustBeA56CharHexHash") },
      { status: 400 }
    );
  }
  if (!isKoiosNetwork(network)) {
    return NextResponse.json(
      { error: i18n("unknownNetworkExpectedPreprodPreviewOrMainnet") },
      { status: 400 }
    );
  }

  try {
    // Pass Koios's UTxO rows straight through, every page of them; the client maps them
    // to its DiscoveredUtxo shape.
    return NextResponse.json(await fetchKoiosCredentialUtxoRows(paymentCredential, network));
  } catch (error) {
    if (error instanceof KoiosCredentialLookupError) {
      logger.error("api.koios_credential_lookup_upstream_failed", {
        upstreamStatus: error.status,
        upstreamBody: error.body.slice(0, 200)
      });
      return NextResponse.json(
        { error: i18n("koiosCredentialLookupFailedValue1", { value1: error.status }) },
        { status: 502 }
      );
    }
    logger.error("api.koios_credential_lookup_failed", { err: serializeError(error) });
    return NextResponse.json({ error: i18n("koiosCredentialLookupFailed") }, {
      status: error instanceof Error && error.name === "TimeoutError" ? 504 : 502,
      headers: { "Retry-After": String(UPSTREAM_RETRY_AFTER_FALLBACK_SECONDS) }
    });
  }
}
