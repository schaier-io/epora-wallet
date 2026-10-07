import "server-only";

import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { koiosBaseUrl } from "@/lib/discovery/koios-server";
import { KoiosDrepsError, type KoiosCall } from "@/lib/governance/drep-index";

const LOOKUP_TIMEOUT_MS = 15_000;

/**
 * One Koios request for the DRep index, on this deployment's network. Every provider
 * failure, a timeout or a body that is not JSON included, is a `KoiosDrepsError`, so the
 * route can tell a Koios outage from its own bug.
 */
export const koiosDrepCall: KoiosCall = async (path, body) => {
  // Outside the try: a bad KOIOS_URL is this deployment's bug, not a Koios outage.
  const url = `${koiosBaseUrl(CARDANO_NETWORK)}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      cache: "no-store"
    });
  } catch (error) {
    throw new KoiosDrepsError(0, null, { cause: error });
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new KoiosDrepsError(response.status, response.headers.get("Retry-After"));
  }
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new KoiosDrepsError(0, null, { cause: error });
  }
};
