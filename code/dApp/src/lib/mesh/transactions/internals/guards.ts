import { createStageError } from "./errors";
import { type OnChainStructuredAction } from "@/lib/contracts/action-data";
import { collectStateDatumWarnings, validateStateDatum } from "@/lib/contracts/state-validation";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { type Asset, type ConstrData } from "@/lib/types/contracts";
import { isConstrData, isRecord } from "@/lib/contracts/plutus-primitives";

// Canonical Plutus-Data guards live in @/lib/contracts/plutus-primitives;
// re-exported so this module's existing importers (datum, errors, script-data)
// keep importing them from "./guards".
export { isConstrData, isRecord };



function isAsset(value: unknown): value is Asset {
  return (
    isRecord(value) &&
    typeof value.unit === "string" &&
    typeof value.quantity === "string"
  );
}



function isLikelyCardanoOutputAddress(value: string) {
  return /^addr(_test)?1[0-9a-z]+$/i.test(value);
}



function isTxHashLike(value: string) {
  return /^[0-9a-f]{64}$/i.test(value);
}



export function assertValidConstrData(value: unknown, label: string) {
  if (!isConstrData(value)) {
    throw new Error(
      `${label} must be a Constr-style object with numeric alternative and array fields.`
    );
  }
}



export function assertValidOptionalConstrData(value: unknown, label: string) {
  if (typeof value === "undefined") {
    return;
  }

  assertValidConstrData(value, label);
}



export function assertValidAssetList(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of asset entries.`);
  }

  value.forEach((asset, index) => {
    if (!isAsset(asset)) {
      throw new Error(
        `${label} entry ${index} must include string "unit" and "quantity" fields.`
      );
    }

    if (asset.unit.trim().length === 0) {
      throw new Error(`${label} entry ${index} must include a non-empty asset unit.`);
    }

    if (!/^-?\d+$/.test(asset.quantity)) {
      throw new Error(`${label} entry ${index} quantity must be an integer string.`);
    }

    if (BigInt(asset.quantity) < 0n) {
      throw new Error(`${label} entry ${index} quantity must be zero or greater.`);
    }
  });
}



function describeInvalidAddress(value: string) {
  if (isTxHashLike(value)) {
    return `Invalid address "${value}". It looks like a transaction hash, not a Cardano address.`;
  }

  return `Invalid address "${value}". Expected a bech32 Cardano address.`;
}



function assertValidAddress(value: unknown, label: string) {
  if (typeof value !== "string" || !isLikelyCardanoOutputAddress(value)) {
    throw new Error(`${label}: ${describeInvalidAddress(String(value))}`);
  }
}



export function assertValidWalletInputRefs(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of {"txHash","outputIndex"} objects.`);
  }

  value.forEach((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.txHash !== "string" ||
      !/^[0-9a-f]{64}$/i.test(entry.txHash) ||
      typeof entry.outputIndex !== "number" ||
      !Number.isInteger(entry.outputIndex) ||
      entry.outputIndex < 0
    ) {
      throw new Error(
        `${label} entry ${index} must include a hex txHash and a non-negative integer outputIndex.`
      );
    }
  });
}



export function assertValidWalletOutputs(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of locking-contract outputs.`);
  }

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${label} entry ${index} must be an object.`);
    }

    assertValidAssetList(entry.amount, `${label} entry ${index} amount`);
    assertValidOptionalConstrData(
      entry.inlineDatum,
      `${label} entry ${index} inlineDatum`
    );
  });
}



export function assertValidPayoutTransfers(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of transfer outputs.`);
  }

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${label} entry ${index} must be an object.`);
    }

    assertValidAddress(entry.address, `${label} entry ${index} address`);
    assertValidAssetList(entry.amount, `${label} entry ${index} amount`);
    assertValidOptionalConstrData(
      entry.inlineDatum,
      `${label} entry ${index} inlineDatum`
    );
  });
}



export function assertRecordPayload(
  value: unknown,
  label: string
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
}



export function assertStateDatumShape(stateDatum: ConstrData, label: string) {
  unwrapStateDatum(stateDatum, label);
}



export function validateForwardedStateDatum(
  stateDatum: ConstrData,
  _action: OnChainStructuredAction,
  stage: string,
  invalidMessage: string
): string[] {
  const unwrappedStateDatum = unwrapStateDatum(stateDatum, "Forwarded STT datum");
  const stateValidationErrors = validateStateDatum(unwrappedStateDatum);
  if (stateValidationErrors.length > 0) {
    throw createStageError(
      stage,
      new Error(stateValidationErrors[0] ?? invalidMessage),
      {
        validationErrors: stateValidationErrors,
        stateDatum: unwrappedStateDatum
      }
    );
  }
  // Non-blocking advisories (e.g. a lapsed wake-up timer, or a beneficiary-only
  // recovery time-locked far out). Accepted on-chain; logged here and returned
  // so the caller can surface them in the review panel before signing.
  const warnings = collectStateDatumWarnings(unwrappedStateDatum);
  for (const warning of warnings) {
    console.warn(`[${stage}] ${warning}`);
  }
  return warnings;
}


