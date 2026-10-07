import "server-only";

import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { koiosBaseUrl } from "@/lib/discovery/koios-server";
import { KoiosDrepsError, type KoiosCall } from "@/lib/governance/drep-index";

const LOOKUP_TIMEOUT_MS = 15_000;

/** One Koios request for the DRep index, on this deployment's network. */
export const koiosDrepCall: KoiosCall = async (path, body) => {
  const response = await fetch(`${koiosBaseUrl(CARDANO_NETWORK)}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    cache: "no-store"
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new KoiosDrepsError(response.status, response.headers.get("Retry-After"));
  }
  return response.json();
};
