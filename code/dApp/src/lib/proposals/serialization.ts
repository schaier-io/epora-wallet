import { resolveTxHash } from "@meshsdk/core-cst";

// Plutus datums (ConstrData) can contain bigint and Map values, neither of
// which survives plain JSON.stringify. These helpers round-trip them losslessly
// so a captured build context can be stored as text and replayed for rebuilds.

const BIGINT_TAG = "$bigint";
const MAP_TAG = "$map";

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return { [BIGINT_TAG]: value.toString() };
  }
  if (value instanceof Map) {
    return { [MAP_TAG]: Array.from(value.entries()) };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record[BIGINT_TAG] === "string") {
      return BigInt(record[BIGINT_TAG]);
    }
    if (Array.isArray(record[MAP_TAG])) {
      return new Map(record[MAP_TAG] as [unknown, unknown][]);
    }
  }
  return value;
}

export function serializeJsonSafe(value: unknown): string {
  return JSON.stringify(value, replacer);
}

export function parseJsonSafe<T>(text: string): T {
  return JSON.parse(text, reviver) as T;
}

// blake2b-256 of the transaction body. Invariant under adding vkey witnesses, so
// it is stable while signatures accumulate and equals the eventual on-chain tx
// hash. A rebuild changes the body and therefore this hash, which is exactly how
// stale signatures are detected.
export function resolveProposalBodyHash(txHex: string): string {
  return resolveTxHash(txHex);
}
