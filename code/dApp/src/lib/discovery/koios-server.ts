import "server-only";

import { getServerEnv } from "@/lib/env/server-env";
import {
  mapKoiosCredentialUtxos,
  type KoiosUtxo
} from "@/lib/discovery/koios-client";

const KOIOS_URLS = {
  preprod: "https://preprod.koios.rest/api/v1",
  preview: "https://preview.koios.rest/api/v1",
  mainnet: "https://api.koios.rest/api/v1"
} as const satisfies Record<string, string>;

export type KoiosNetwork = keyof typeof KOIOS_URLS;

export function isKoiosNetwork(network: string): network is KoiosNetwork {
  return network in KOIOS_URLS;
}

function koiosBaseUrl(network: KoiosNetwork): string {
  return getServerEnv().KOIOS_URL ?? KOIOS_URLS[network];
}

export function requestKoiosCredentialUtxos(
  paymentCredentialHex: string,
  network: KoiosNetwork = "preprod"
) {
  if (!/^[0-9a-f]{56}$/i.test(paymentCredentialHex)) {
    throw new Error("Koios payment credential must be a 56-character hex hash.");
  }
  return fetch(`${koiosBaseUrl(network)}/credential_utxos`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      _payment_credentials: [paymentCredentialHex],
      _extended: true
    })
  });
}

export async function fetchCredentialUtxosFromKoios(
  paymentCredentialHex: string,
  network: KoiosNetwork = "preprod"
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
