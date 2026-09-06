import { assertNonAdminStreamingActionWindow } from "@/lib/contracts/crank-cooldown";
import { assertStateDatumShape, isConstrData } from "./guards";
import { readStateSections } from "@/lib/contracts/state-layout";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { readInteger } from "@/lib/contracts/plutus-primitives";
import {
  assertNonNegativeUint64,
  type OnChainInteger,
  toOnChainBigInt
} from "@/lib/contracts/on-chain-integer";
import { type ConstrData } from "@/lib/types/contracts";
import { type UTxO, deserializeDatum } from "@meshsdk/core";

function normalizeInteger(value: bigint): number | bigint {
  const asNumber = Number(value);
  return Number.isSafeInteger(asNumber) ? asNumber : value;
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



export function decodeConstrDatumFromUtxo(utxo: UTxO): ConstrData | null {
  const datumCbor = utxo.output.plutusData;
  if (!datumCbor) {
    // No inline datum at all, which is a normal, expected case.
    return null;
  }

  let normalized: unknown;
  try {
    normalized = normalizeDatumValue(deserializeDatum(datumCbor));
  } catch (error) {
    // Present but undecodable: distinct from "absent". A corrupt on-chain datum
    // is the diagnostic a failed fund-moving tx needs, so log it in development,
    // then fall back to null so callers still report their own "missing datum" error.
    if (process.env.NODE_ENV !== "production") {
      const ref = `${utxo.input.txHash}#${utxo.input.outputIndex}`;
      console.warn(`[datum] failed to decode inline datum on ${ref}:`, error);
    }
    return null;
  }

  if (isConstrData(normalized)) {
    return normalized;
  }

  // Decodable but not a constructor datum (a different datum type), legitimately
  // "not what we're looking for", so null without noise.
  return null;
}



export function deriveBeneficiaryWithdrawalId(stateDatum: ConstrData, signerKeyHash: string) {
  assertStateDatumShape(stateDatum, "Beneficiary Withdrawal state datum");

  const unwrappedStateDatum = unwrapStateDatum(stateDatum, "Beneficiary Withdrawal state datum");
  const { beneficiaries } = readStateSections(
    unwrappedStateDatum,
    "Beneficiary Withdrawal state datum"
  );

  const matches = beneficiaries.flatMap((beneficiary, index) => {
    if (!isConstrData(beneficiary) || beneficiary.alternative !== 0 || beneficiary.fields.length !== 4) {
      throw new Error(
        `Beneficiary Withdrawal beneficiaries[${index}] must be a Beneficiary constructor.`
      );
    }

    const beneficiaryId = readInteger(
      beneficiary.fields[0],
      `Beneficiary Withdrawal beneficiaries[${index}].id`
    );
    const beneficiaryWallets = beneficiary.fields[1];
    if (!Array.isArray(beneficiaryWallets)) {
      throw new Error(
        `Beneficiary Withdrawal beneficiaries[${index}].beneficiary_wallets must be a list.`
      );
    }

    return beneficiaryWallets.includes(signerKeyHash) ? [beneficiaryId] : [];
  });

  if (matches.length !== 1) {
    throw new Error(
      "Beneficiary Withdrawal requires exactly one beneficiary matching the connected payment key hash."
    );
  }

  return matches[0]!;
}

// `deriveStreamingPaymentPayoutStateDatum` now lives in the pure, unit-tested
// `@/lib/contracts/streaming-payout` module (imported above), so the forwarded
// state datum can be verified to preserve the other `State` fields without
// pulling in this file's Mesh/browser dependencies.

// Earlier beneficiaries are removed after one withdrawal. The final
// beneficiary stays in State so it can recover separate fund pools in separate
// transactions, and its withdrawal advances the shared non-admin cadence stamp.
// An earlier-beneficiary withdrawal preserves every other State field.
export function deriveBeneficiaryWithdrawalStateDatum(
  stateDatum: ConstrData,
  beneficiaryId: OnChainInteger,
  txLatestTimeMs: OnChainInteger
): ConstrData {
  const targetId = toOnChainBigInt(beneficiaryId, "Beneficiary withdrawal id");
  assertNonNegativeUint64(targetId, "Beneficiary withdrawal id");
  const latestTime = toOnChainBigInt(
    txLatestTimeMs,
    "Beneficiary withdrawal transaction upper bound"
  );
  assertNonNegativeUint64(
    latestTime,
    "Beneficiary withdrawal transaction upper bound"
  );
  const unwrappedStateDatum = unwrapStateDatum(
    stateDatum,
    "Beneficiary withdrawal state datum"
  );
  const sections = readStateSections(
    unwrappedStateDatum,
    "Beneficiary withdrawal state datum"
  );

  const beneficiaryIds = sections.beneficiaries.map((beneficiary, index) => {
    if (
      !isConstrData(beneficiary) ||
      beneficiary.alternative !== 0 ||
      beneficiary.fields.length !== 4
    ) {
      throw new Error(
        `Beneficiary withdrawal beneficiaries[${index}] must be a Beneficiary constructor.`
      );
    }
    return BigInt(
      readInteger(
        beneficiary.fields[0],
        `Beneficiary withdrawal beneficiaries[${index}].id`
      )
    );
  });

  if (beneficiaryIds.filter((id) => id === targetId).length !== 1) {
    throw new Error(
      `Beneficiary withdrawal expects exactly one beneficiary with id ${beneficiaryId}.`
    );
  }

  if (sections.beneficiaries.length === 1) {
    const nextFields = [...unwrappedStateDatum.fields];
    nextFields[5] = {
      alternative: 0,
      fields: [txLatestTimeMs]
    };
    return {
      ...unwrappedStateDatum,
      fields: nextFields
    };
  }

  const nextBeneficiaries = sections.beneficiaries.filter(
    (_, index) => beneficiaryIds[index] !== targetId
  );

  const access = sections.access;
  // readStateSections guarantees access is an AccessControl constructor with
  // exactly three fields, so the first two reads cannot be out of bounds.
  const [users, multiSigThreshold] = access.fields;
  const nextAccess: ConstrData = {
    ...access,
    fields: [users!, multiSigThreshold!, nextBeneficiaries]
  };

  // Preserve every other state field (proof-of-life, streaming payments, and
  // wallet name when present) by swapping only the access section.
  const nextFields = [...unwrappedStateDatum.fields];
  nextFields[0] = nextAccess;

  return {
    ...unwrappedStateDatum,
    fields: nextFields
  };
}

/** Permanent exit shares withdrawal accounting, but also removes the final beneficiary. */
export function deriveBeneficiaryExitStateDatum(
  stateDatum: ConstrData,
  beneficiaryId: OnChainInteger,
  txEarliestTimeMs: number,
  txLatestTimeMs: number
): ConstrData {
  const sections = readStateSections(stateDatum, "Beneficiary exit state datum");
  const isFinal = sections.beneficiaries.length === 1;
  if (isFinal) {
    if (sections.streamingPayments.length > 0) {
      throw new Error("Final beneficiary exit requires all streaming payments to be settled and removed first.");
    }
    assertNonAdminStreamingActionWindow(
      stateDatum, txEarliestTimeMs, txLatestTimeMs, "Final beneficiary exit"
    );
  }
  const output = deriveBeneficiaryWithdrawalStateDatum(stateDatum, beneficiaryId, txLatestTimeMs);
  if (!isFinal) return output;
  const access = readStateSections(output, "Beneficiary exit output datum").access;
  return {
    ...output,
    fields: [
      { ...access, fields: [access.fields[0]!, access.fields[1]!, []] },
      ...output.fields.slice(1)
    ]
  };
}
