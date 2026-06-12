import { type Asset, type ConstrData } from "@/lib/types/contracts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isAsset(value: unknown): value is Asset {
  return (
    isRecord(value) &&
    typeof value.unit === "string" &&
    typeof value.quantity === "string"
  );
}

export function isConstrDataValue(value: unknown): value is ConstrData {
  return (
    isRecord(value) &&
    typeof value.alternative === "number" &&
    Array.isArray(value.fields)
  );
}

export function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

