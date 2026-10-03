import { SLOT_CONFIG_NETWORK, slotToBeginUnixTime } from "@meshsdk/core";
import { deserializeTx } from "@/lib/mesh/cst";
import { NETWORK } from "@/lib/mesh/transactions/internals/constants";

const MAX_DATE_TIMESTAMP_MS = 8_640_000_000_000_000;

export function proposalExpiry(txHex: string): number | null {
  try {
    const ttl = deserializeTx(txHex).body().ttl();
    if (ttl == null || ttl < 0n || ttl > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    const timestamp = slotToBeginUnixTime(Number(ttl), SLOT_CONFIG_NETWORK[NETWORK]);
    return Number.isSafeInteger(timestamp) && timestamp >= 0 && timestamp <= MAX_DATE_TIMESTAMP_MS ? timestamp : null;
  } catch { return null; }
}
