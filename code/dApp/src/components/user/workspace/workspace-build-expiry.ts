"use client";

import { slotToBeginUnixTime } from "@/lib/cardano-slot-time";
import type { BuildResult } from "@/lib/types/contracts";

/**
 * Per-result expiry, cached the moment a build settles. The TTL lives inside the
 * transaction's CBOR, so reading it needs the serialisation stack — loaded on
 * demand, because the workspace module graph is reachable from the /user page
 * and a static value import would put the Mesh chunk on its first load (see
 * app/layout-mesh-boundary.test.ts). Reading stays synchronous, exactly like the
 * expiry checks inside the submit and build flows always were.
 */
const expiresAtMsCache = new WeakMap<BuildResult, number | null>();

/** Parse and remember `result`'s expiry. Called once per result, when a build settles. */
export async function warmBuildResultExpiry(result: BuildResult): Promise<void> {
  if (expiresAtMsCache.has(result)) return;
  let expiresAtMs: number | null = null;
  try {
    const { deserializeTx } = await import("@/lib/mesh/cst");
    const ttl = deserializeTx(result.txHex).body().ttl();
    if (ttl !== undefined) {
      const slot = Number(ttl);
      if (Number.isSafeInteger(slot)) expiresAtMs = slotToBeginUnixTime(slot);
    }
  } catch {
    // Unparseable transaction: treat as unbounded, like the direct parse did.
  }
  expiresAtMsCache.set(result, expiresAtMs);
}

/**
 * Whether `result`'s TTL has passed. Results that never went through a build
 * completion (or could not be parsed) read as unbounded.
 */
export function isWorkspaceBuildResultExpired(result: BuildResult): boolean {
  const expiresAtMs = expiresAtMsCache.get(result);
  return expiresAtMs !== null && expiresAtMs !== undefined && expiresAtMs <= Date.now();
}
