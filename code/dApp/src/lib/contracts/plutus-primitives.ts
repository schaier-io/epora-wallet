import type { Data } from "@meshsdk/common";
import type { ConstrData } from "@/lib/types/contracts";

// Shared primitives for reading Plutus `Data` that mirrors the on-chain types.
// These are the off-chain half of the contract's encoding and must match the
// validator exactly, so they live in one place rather than being re-derived per
// caller (which previously let copies drift). The readers throw on a shape
// mismatch — callers decode their own builder output or trusted chain data;
// validation-mode readers that instead collect errors live with the validators.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isConstrData(value: unknown): value is ConstrData {
  return (
    isRecord(value) &&
    typeof value.alternative === "number" &&
    Array.isArray(value.fields)
  );
}

export function readInteger(value: Data, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`);
  }

  return value;
}

export function readByteArray(value: Data, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a byte-array string.`);
  }

  return value;
}

export function readBoolean(value: Data, label: string): boolean {
  // Aiken/Plutus Bool: False = constructor 0, True = constructor 1.
  if (!isConstrData(value) || value.fields.length !== 0) {
    throw new Error(`${label} must be a Bool constructor.`);
  }

  if (value.alternative === 0) {
    return false;
  }

  if (value.alternative === 1) {
    return true;
  }

  throw new Error(`${label} must be a valid Bool constructor.`);
}

export function readOptionalInteger(value: Data, label: string): number | null {
  if (!isConstrData(value)) {
    throw new Error(`${label} must be an Option constructor.`);
  }

  if (value.alternative === 1 && value.fields.length === 0) {
    return null;
  }

  if (value.alternative === 0 && value.fields.length === 1) {
    return readInteger(value.fields[0], `${label}.Some`);
  }

  throw new Error(`${label} must be a valid Option constructor.`);
}

export function readWallets(value: Data, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a list.`);
  }

  return value.map((entry, index) => readByteArray(entry, `${label}[${index}]`));
}
