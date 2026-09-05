import { NextResponse } from "next/server";
import {
  isKoiosNetwork,
  requestKoiosCredentialUtxos
} from "@/lib/discovery/koios-server";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { logger, serializeError } from "@/lib/observability/logger";
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
  let payload: { paymentCredential?: string; network?: string };
  try {
    payload = (await readBoundedJson(request, 2 * 1024)) as {
      paymentCredential?: string;
      network?: string;
    };
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: i18n("invalidJsonBody") }, { status: 400 });
  }

  const paymentCredential = payload.paymentCredential?.trim();
  const network = payload.network?.trim() || "preprod";

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
    const response = await requestKoiosCredentialUtxos(paymentCredential, network);

    const text = await response.text();
    if (!response.ok) {
      logger.error("api.koios_credential_lookup_upstream_failed", {
        upstreamStatus: response.status,
        upstreamBody: text.slice(0, 200)
      });
      return NextResponse.json(
        { error: i18n("koiosCredentialLookupFailedValue1", { value1: response.status }) },
        { status: 502 }
      );
    }

    // Pass Koios's UTxO rows straight through; the client maps them to its
    // DiscoveredUtxo shape.
    return new NextResponse(text, {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    logger.error("api.koios_credential_lookup_failed", { err: serializeError(error) });
    return NextResponse.json({ error: i18n("koiosCredentialLookupFailed") }, { status: 502 });
  }
}
