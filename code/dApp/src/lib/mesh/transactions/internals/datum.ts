import { assertStateDatumShape, isConstrData } from "./guards";
import { readStateSections } from "@/lib/contracts/state-layout";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { type ConstrData } from "@/lib/types/contracts";
import { type UTxO, deserializeDatum } from "@meshsdk/core";

function normalizeDatumValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
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
    const asNumber = Number(entry.int);
    return Number.isSafeInteger(asNumber) ? asNumber : entry.int.toString();
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
    // No inline datum at all — a normal, expected case.
    return null;
  }

  let normalized: unknown;
  try {
    normalized = normalizeDatumValue(deserializeDatum(datumCbor));
  } catch (error) {
    // Present but undecodable: distinct from "absent". Don't swallow it
    // silently — a corrupt/unexpected on-chain datum is exactly the diagnostic
    // a failed fund-moving tx needs. Surface it, then fall back to null so
    // callers still report their domain-specific "missing datum" error.
    const ref = `${utxo.input.txHash}#${utxo.input.outputIndex}`;
    console.warn(`[datum] failed to decode inline datum on ${ref}:`, error);
    return null;
  }

  if (
    typeof normalized === "object" &&
    normalized !== null &&
    "alternative" in normalized &&
    "fields" in normalized
  ) {
    return normalized as ConstrData;
  }

  // Decodable but not a constructor datum (a different datum type) — legitimately
  // "not what we're looking for", so null without noise.
  return null;
}



function readIntData(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`);
  }

  return value;
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

    const beneficiaryId = readIntData(
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
// state datum can be verified to preserve all four `State` fields without
// pulling in this file's Mesh/browser dependencies.

// A beneficiary withdrawal is one-shot: the acting beneficiary is removed from
// the forwarded state and nothing else changes. The on-chain STT validator
// requires output == input with exactly this beneficiary removed, so the
// forwarded datum must be rebuilt here rather than reusing the input state.


export function deriveBeneficiaryWithdrawalStateDatum(
  stateDatum: ConstrData,
  beneficiaryId: number
): ConstrData {
  const unwrappedStateDatum = unwrapStateDatum(
    stateDatum,
    "Beneficiary withdrawal state datum"
  );
  const sections = readStateSections(
    unwrappedStateDatum,
    "Beneficiary withdrawal state datum"
  );

  const nextBeneficiaries = sections.beneficiaries.filter((beneficiary, index) => {
    if (
      !isConstrData(beneficiary) ||
      beneficiary.alternative !== 0 ||
      beneficiary.fields.length !== 4
    ) {
      throw new Error(
        `Beneficiary withdrawal beneficiaries[${index}] must be a Beneficiary constructor.`
      );
    }
    return (
      readIntData(
        beneficiary.fields[0],
        `Beneficiary withdrawal beneficiaries[${index}].id`
      ) !== beneficiaryId
    );
  });

  if (nextBeneficiaries.length !== sections.beneficiaries.length - 1) {
    throw new Error(
      `Beneficiary withdrawal expects exactly one beneficiary with id ${beneficiaryId} to remove.`
    );
  }

  const access = sections.access;
  const [users, multiSigThreshold] = access.fields;
  const nextAccess: ConstrData = {
    ...access,
    fields: [users, multiSigThreshold, nextBeneficiaries]
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


