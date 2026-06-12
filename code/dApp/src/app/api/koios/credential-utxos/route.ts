import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Server-side proxy for Koios `credential_utxos`.
//
// Koios's public API does NOT send an `access-control-allow-origin` header, so a
// browser cannot read it cross-origin — every client-side fetch fails with
// "TypeError: Failed to fetch" (verified: Blockfrost/GitHub return `*` and work
// in-browser; koios.rest returns no ACAO and fails for every origin, not just a
// sandbox). The server has no such restriction, so we proxy the one call the
// orphan / stake-address ("Franken" UTxO) discovery needs.
//
//   POST /api/koios/credential-utxos  { paymentCredential: "<56-hex>", network? }
//     → Koios `credential_utxos` rows (passed through; the client maps them)
//
// Trade-off vs. the old direct-from-browser design: the app server now sees the
// queried payment credential. Acceptable — the call simply does not work from
// the browser otherwise.

const KOIOS_URLS: Record<string, string> = {
  preprod: "https://preprod.koios.rest/api/v1",
  preview: "https://preview.koios.rest/api/v1",
  mainnet: "https://api.koios.rest/api/v1"
};

function koiosBaseUrl(network: string): string {
  const fromEnv = process.env.KOIOS_URL;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return KOIOS_URLS[network] ?? KOIOS_URLS.preprod;
}

export async function POST(request: Request) {
  let payload: { paymentCredential?: string; network?: string };
  try {
    payload = (await request.json()) as { paymentCredential?: string; network?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const paymentCredential = payload.paymentCredential?.trim();
  const network = payload.network?.trim() || "preprod";

  if (!paymentCredential) {
    return NextResponse.json(
      { error: "Provide a paymentCredential (28-byte blake2b-224 hash, hex)." },
      { status: 400 }
    );
  }
  // Cheap shape guard before hitting Koios.
  if (!/^[0-9a-f]{56}$/i.test(paymentCredential)) {
    return NextResponse.json(
      { error: "paymentCredential must be a 56-char hex hash." },
      { status: 400 }
    );
  }
  if (!(network in KOIOS_URLS)) {
    return NextResponse.json(
      { error: "Unknown network (expected preprod, preview, or mainnet)." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${koiosBaseUrl(network)}/credential_utxos`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        _payment_credentials: [paymentCredential],
        _extended: true
      })
    });

    const text = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { error: `Koios credential_utxos failed (${response.status}): ${text.slice(0, 200)}` },
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
    const message = error instanceof Error ? error.message : "Koios proxy request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
