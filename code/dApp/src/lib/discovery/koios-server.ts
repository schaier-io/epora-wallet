import { CARDANO_NETWORK } from "@/lib/cardano-network";
import "server-only";
import { waitForReadRetry } from "@/lib/mesh/read-retry";

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
// Koios answers at most this many rows per request and serves the rest behind
// `offset` (Koios API spec, "Pagination (offset/limit)").
const KOIOS_PAGE_ROWS = 1000;
// Bounds one lookup: 20 pages is 20,000 UTxOs at a single payment credential.
const MAX_PAGES = 20;

export class KoiosCredentialLookupError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`Koios credential_utxos failed (${status}): ${body.slice(0, 200)}`);
  }
}

export type KoiosNetwork = keyof typeof KOIOS_URLS;

export function isKoiosNetwork(network: string): network is KoiosNetwork {
  // Own keys only: `in` also accepted inherited names such as "toString".
  return Object.hasOwn(KOIOS_URLS, network);
}

function koiosBaseUrl(network: KoiosNetwork): string {
  return getServerEnv().KOIOS_URL ?? KOIOS_URLS[network];
}

export async function requestKoiosCredentialUtxos(
  paymentCredentialHex: string,
  network: KoiosNetwork = CARDANO_NETWORK,
  offset = 0,
  // All attempts share one deadline, including response body reads. A paged
  // lookup passes its own, so every page draws on the same budget.
  signal: AbortSignal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
) {
  if (!/^[0-9a-f]{56}$/i.test(paymentCredentialHex)) {
    throw new Error("Koios payment credential must be a 56-character hex hash.");
  }
  const url = `${koiosBaseUrl(network)}/credential_utxos${offset > 0 ? `?offset=${offset}` : ""}`;
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
    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof TypeError) || attempt >= MAX_ATTEMPTS) throw error;
      await waitForReadRetry(RETRY_DELAY_MS * attempt, signal);
      continue;
    }
    const delay = parseRetryAfterMs(response.headers.get("Retry-After"))
      ?? RETRY_DELAY_MS * attempt;
    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= MAX_ATTEMPTS
      || delay > MAX_RETRY_DELAY_MS || signal.aborted) {
      return response;
    }
    // Credential lookup is read-only. Release each discarded response before retrying.
    await response.body?.cancel();
    await waitForReadRetry(delay, signal);
  }
}

/** Every `credential_utxos` row for one payment credential, across all Koios pages. */
export async function fetchKoiosCredentialUtxoRows(
  paymentCredentialHex: string,
  network: KoiosNetwork = CARDANO_NETWORK
): Promise<KoiosUtxo[]> {
  // Offset pages are read one after another, not as a snapshot. A UTxO created
  // between two reads shifts the rows, so a later page can repeat a row it
  // already served. Key rows by output reference to list each UTxO once.
  // A UTxO spent between two reads shifts rows the other way, and one row can
  // be skipped. Keying cannot restore it; the next lookup lists it again.
  const rows = new Map<string, KoiosUtxo>();
  const signal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await requestKoiosCredentialUtxos(
      paymentCredentialHex,
      network,
      page * KOIOS_PAGE_ROWS,
      signal
    );
    const text = await response.text();
    if (!response.ok) {
      throw new KoiosCredentialLookupError(response.status, text);
    }
    let pageRows: unknown;
    try {
      pageRows = JSON.parse(text);
    } catch {
      throw new Error("Koios credential_utxos returned invalid JSON.");
    }
    if (!Array.isArray(pageRows)) {
      throw new Error("Koios credential_utxos returned a malformed response.");
    }
    for (const row of pageRows as KoiosUtxo[]) {
      rows.set(`${row.tx_hash}#${row.tx_index}`, row);
    }
    if (pageRows.length < KOIOS_PAGE_ROWS) {
      return [...rows.values()];
    }
  }
  throw new Error("Koios credential_utxos returned more UTxOs than one lookup reads.");
}

export async function fetchCredentialUtxosFromKoios(
  paymentCredentialHex: string,
  network: KoiosNetwork = CARDANO_NETWORK
) {
  return mapKoiosCredentialUtxos(
    await fetchKoiosCredentialUtxoRows(paymentCredentialHex, network)
  );
}
