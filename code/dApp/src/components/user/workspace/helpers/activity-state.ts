import type { UTxO } from "@meshsdk/core";
import { decodeDatumFromUtxo } from "@/lib/mesh/datum";
import { readStateSections } from "@/lib/contracts/state-layout";
import { stateFormFromDatum, type StreamingPaymentFormState } from "@/lib/contracts/state-form";
import { validateStateDatum } from "@/lib/contracts/state-validation";
import { readOptionalInteger } from "@/lib/contracts/plutus-primitives";

/** Datum equality preserves integers beyond JavaScript's safe-number range. */
function equalDatum(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => equalDatum(value, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return keys.length === Object.keys(rightRecord).length && keys.every((key) =>
    Object.hasOwn(rightRecord, key) && equalDatum(leftRecord[key], rightRecord[key]));
}

function readUniqueState(utxos: UTxO[], sttUnit: string) {
  const candidates = utxos.filter((utxo) => utxo.output.amount.some((asset) =>
    asset.unit === sttUnit && asset.quantity === "1"));
  if (candidates.length !== 1) return null;
  const datum = decodeDatumFromUtxo(candidates[0]!);
  if (!datum) return null;
  // Decode nested records as well: the section reader only validates the outer layout.
  if (validateStateDatum(datum, { allowNoReachableAccessPath: true }).length > 0) return null;
  const sections = readStateSections(datum);
  readOptionalInteger(sections.increment, "Proof-of-life increment");
  const unlockTime = readOptionalInteger(sections.unlockTime, "Proof-of-life unlock time");
  return { ...sections, unlockTime, streams: stateFormFromDatum(datum).streamingPayments };
}

/** Shortening/removal can be cancellation or settlement; only definite rule edits are settings. */
function hasStreamingConfigurationChange(before: StreamingPaymentFormState[], after: StreamingPaymentFormState[]) {
  return after.some((stream) => {
    const previous = before.find((candidate) => candidate.id === stream.id);
    if (!previous) return true;
    return previous.payoutAddress !== stream.payoutAddress ||
      previous.policyId !== stream.policyId || previous.assetName !== stream.assetName ||
      previous.amountPerDay !== stream.amountPerDay || previous.startDate !== stream.startDate ||
      BigInt(stream.endDate) > BigInt(previous.endDate);
  });
}

/** Unknown state changes remain neutral; payouts must not look like settings edits. */
export function classifyActivityStateChange(
  inputs: UTxO[],
  outputs: UTxO[],
  sttUnit: string
): "check-in" | "settings" | "updated" {
  try {
    const before = readUniqueState(inputs, sttUnit);
    const after = readUniqueState(outputs, sttUnit);
    if (!before || !after) return "updated";
    if (!equalDatum(before.access, after.access) ||
        before.walletName !== after.walletName ||
        !equalDatum(before.intendedStakeCredential, after.intendedStakeCredential) ||
        !equalDatum(before.increment, after.increment) ||
        hasStreamingConfigurationChange(before.streams, after.streams)) return "settings";

    // Replace only the unlock-time field. Every other field, including future fields,
    // stream counters and payout cadence, must remain equal for a check-in.
    const afterWithPreviousUnlock = {
      ...after.state,
      fields: after.state.fields.map((field, index) => index === 1
        ? { ...after.proofOfLife, fields: [before.proofOfLife.fields[0]!, after.increment] }
        : field)
    };
    return before.unlockTime !== null && after.unlockTime !== null &&
      BigInt(after.unlockTime) > BigInt(before.unlockTime) &&
      equalDatum(before.state, afterWithPreviousUnlock)
      ? "check-in" : "updated";
  } catch {
    return "updated";
  }
}
