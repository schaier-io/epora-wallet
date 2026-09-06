import type { ConstrData } from "@/lib/types/contracts";
import { unwrapStateDatum } from "./stt-datum";
import { deriveBeneficiaryWithdrawalId } from "./beneficiary-identity";
import { readStateSections, isConstrData } from "./state-layout";
import { readInteger, readOptionalInteger } from "./plutus-primitives";
import { type OnChainInteger, toOnChainBigInt } from "./on-chain-integer";
import { deriveStreamingPaymentCancellationStateDatum } from "./streaming-cancel";

const MILLISECONDS_PER_DAY = 86_400_000n;

/** Stop one stream without changing accrued obligations or beneficiary rights. */
export function deriveBeneficiaryStreamStopStateDatum(input: {
  stateDatum: ConstrData;
  beneficiarySignerKeyHash: string;
  additionalSignerKeyHashes?: readonly string[];
  streamingPaymentId: OnChainInteger;
  txEarliestTimeMs: number;
  txLatestTimeMs: number;
}) {
  const { txEarliestTimeMs, txLatestTimeMs } = input;
  const stateDatum = unwrapStateDatum(input.stateDatum, "Beneficiary stream stop state datum");
  const beneficiaryId = deriveBeneficiaryWithdrawalId(stateDatum, input.beneficiarySignerKeyHash);
  const sections = readStateSections(stateDatum);
  const beneficiary = sections.beneficiaries.find((entry) =>
    isConstrData(entry) && BigInt(readInteger(entry.fields[0]!, "Beneficiary id")) === BigInt(beneficiaryId)
  )! as ConstrData;
  const unlockTime = readOptionalInteger(sections.unlockTime, "Proof of life unlock time");
  const unlockAfter = readOptionalInteger(beneficiary.fields[2]!, "Beneficiary unlock after");
  if (unlockTime === null || !Number.isSafeInteger(txEarliestTimeMs) ||
    BigInt(txEarliestTimeMs) < BigInt(unlockTime) ||
    (unlockAfter !== null && BigInt(txEarliestTimeMs) < BigInt(unlockAfter))) {
    throw new Error("Stopping a beneficiary stream requires an unlocked beneficiary at the transaction's earliest time.");
  }
  for (const entry of sections.beneficiaries) {
    const other = entry as ConstrData; // The identity resolver validates every beneficiary record.
    if (BigInt(readInteger(other.fields[0]!, "Beneficiary id")) === BigInt(beneficiaryId)) continue;
    const wallets = other.fields[1] as string[];
    const otherUnlockAfter = readOptionalInteger(other.fields[2]!, "Beneficiary unlock after");
    if (input.additionalSignerKeyHashes?.some((key) => wallets.includes(key)) &&
      (otherUnlockAfter === null || BigInt(txEarliestTimeMs) >= BigInt(otherUnlockAfter))) {
      throw new Error("Stopping a stream requires exactly one unlocked beneficiary in the transaction signer set.");
    }
  }
  const streamingPaymentId = toOnChainBigInt(input.streamingPaymentId, "Beneficiary stream stop id");
  // Reuse the payee cutoff, strict-shortening and shared cadence checks. No admin bypass applies.
  const { outputDatum } = deriveStreamingPaymentCancellationStateDatum(
    stateDatum, streamingPaymentId, txEarliestTimeMs, txLatestTimeMs
  );
  const targets = sections.streamingPayments.filter((entry) =>
    isConstrData(entry) && BigInt(readInteger(entry.fields[0]!, "Streaming payment id")) === streamingPaymentId
  );
  if (targets.length !== 1) throw new Error("Stopping a beneficiary stream requires exactly one matching streaming payment.");
  const target = targets[0] as ConstrData;
  const start = BigInt(readInteger(target.fields[6]!, "Streaming payment start"));
  const oldEndDate = readInteger(target.fields[7]!, "Streaming payment end");
  const cutoff = start > BigInt(txLatestTimeMs) ? start : BigInt(txLatestTimeMs);
  const paidOutAmount = BigInt(readInteger(target.fields[2]!, "Streaming payment paid amount"));
  const rate = BigInt(readInteger(target.fields[5]!, "Streaming payment rate"));
  const remaining = (cutoff - start) * rate / MILLISECONDS_PER_DAY - paidOutAmount;
  if (remaining < 0n) throw new Error("Stopping this stream would leave its paid amount above the shortened lifetime total.");
  const policyId = target.fields[3];
  const assetName = target.fields[4];
  if (typeof policyId !== "string" || typeof assetName !== "string") throw new Error("Streaming payment asset must contain byte strings.");
  return {
    outputDatum, beneficiaryId, streamingPaymentId, oldEndDate, cutoff, paidOutAmount,
    retainedDebt: remaining,
    unit: policyId === "" && assetName === "" ? "lovelace" : policyId + assetName
  };
}
