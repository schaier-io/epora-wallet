import { deserializeDatum, type UTxO } from "@meshsdk/core";
import type { ConstrData } from "@/lib/types/contracts";

function normalizeInteger(value: bigint) {
  const asNumber = Number(value);
  return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
}

function normalizeDatumValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return normalizeInteger(value);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeDatumValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  if ("constructor" in value && "fields" in value) {
    const entry = value as { constructor: bigint; fields: unknown[] };
    return {
      alternative: Number(entry.constructor),
      fields: entry.fields.map(normalizeDatumValue)
    };
  }

  if ("int" in value) {
    const entry = value as { int: bigint };
    return normalizeInteger(entry.int);
  }

  if ("bytes" in value) {
    const entry = value as { bytes: string };
    return entry.bytes;
  }

  if ("list" in value) {
    const entry = value as { list: unknown[] };
    return entry.list.map(normalizeDatumValue);
  }

  if ("map" in value) {
    const entry = value as { map: Array<{ k: unknown; v: unknown }> };
    return {
      map: entry.map.map((pair) => ({
        k: normalizeDatumValue(pair.k),
        v: normalizeDatumValue(pair.v)
      }))
    };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeDatumValue(entry)])
  );
}

export function decodeDatumFromUtxo(utxo: UTxO): ConstrData | null {
  const datumCbor = utxo.output.plutusData;
  if (!datumCbor) {
    return null;
  }

  try {
    const normalized = normalizeDatumValue(deserializeDatum(datumCbor));
    if (
      typeof normalized === "object" &&
      normalized !== null &&
      "alternative" in normalized &&
      "fields" in normalized
    ) {
      return normalized as ConstrData;
    }
  } catch {
    return null;
  }

  return null;
}
