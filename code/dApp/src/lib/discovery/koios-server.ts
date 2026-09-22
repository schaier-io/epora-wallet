import { CARDANO_NETWORK } from "@/lib/cardano-network";
import "server-only";

import { getServerEnv } from "@/lib/env/server-env";
import { parseRetryAfterMs } from "@/lib/http/retry-after";
import {
  mapKoiosCredentialUtxos,
  type KoiosUtxo
} from "@/lib/discovery/koios-client";

const KOIOS_URLS = {
  preprod: "https://preprod.koios.rest/api/v1",
  preview: "https://preview.koios.rest/api/v1",
  mainnet: "https://api.koios.rest/api/v1"
} as const satisfies Record<string, string>;

const LOOKUP_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 1_000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

export type KoiosNetwork = keyof typeof KOIOS_URLS;

export function isKoiosNetwork(network: string): network is KoiosNetwork {
  return network in KOIOS_URLS;
}

function koiosBaseUrl(network: KoiosNetwork): string {
  return getServerEnv().KOIOS_URL ?? KOIOS_URLS[network];
}

export async function requestKoiosCredentialUtxos(
  paymentCredentialHex: string,
  network: KoiosNetwork = CARDANO_NETWORK
) {
  if (!/^[0-9a-f]{56}$/i.test(paymentCredentialHex)) {
    throw new Error("Koios payment credential must be a 56-character hex hash.");
  }
  const url = `${koiosBaseUrl(network)}/credential_utxos`;
  // All attempts share the original deadline, including response body reads.
  const signal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  const options = {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      _payment_credentials: [paymentCredentialHex],
      _extended: true
    })
  };
  for (let attempt = 1; ; attempt++) {
    signal.throwIfAborted();
    const response = await fetch(url, options);
    const delay = parseRetryAfterMs(response.headers.get("Retry-After"))
      ?? RETRY_DELAY_MS * attempt;
    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= MAX_ATTEMPTS
      || delay > MAX_RETRY_DELAY_MS || signal.aborted) {
      return response;
    }
    // Credential lookup is read-only. Release each discarded response before retrying.
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export async function fetchCredentialUtxosFromKoios(
  paymentCredentialHex: string,
  network: KoiosNetwork = CARDANO_NETWORK
) {
  const response = await requestKoiosCredentialUtxos(paymentCredentialHex, network);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Koios credential_utxos failed (${response.status}): ${text.slice(0, 200)}`
    );
  }

  let rows: unknown;
  try {
    rows = JSON.parse(text);
  } catch {
    throw new Error("Koios credential_utxos returned invalid JSON.");
  }
  if (!Array.isArray(rows)) {
    throw new Error("Koios credential_utxos returned a malformed response.");
  }
  return mapKoiosCredentialUtxos(rows as KoiosUtxo[]);
}
