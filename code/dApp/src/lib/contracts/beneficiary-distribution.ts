import type { Asset, ConstrData, PayoutTransfer, WalletInputRef } from "@/lib/types/contracts";
import { deriveBeneficiaryWithdrawalId } from "./beneficiary-identity";
import { assertNonAdminStreamingActionWindow } from "./crank-cooldown";
import { decodePayoutAddressFromData } from "./payout-address";
import { readInteger, readOptionalInteger } from "./plutus-primitives";
import { readStateSections } from "./state-layout";
import { validateStateDatum } from "./state-validation";
import { unwrapStateDatum } from "./stt-datum";
import { parseValueData, partsToUnit, serializeAssetsToValueData } from "./value-data";
export type BeneficiaryDistributionPayout = PayoutTransfer & {
  beneficiaryId: number | bigint;
  weight: bigint;
  inlineDatum: ConstrData;
};
/** Exact entitlement before external minimum-ADA topups. No rounding is permitted. */
export function deriveBeneficiaryDistributionStateDatum(input: {
  stateDatum: ConstrData;
  beneficiarySignerKeyHash: string;
  walletInputAmount: Asset[];
  sttInput: WalletInputRef;
  txEarliestTimeMs: number;
  txLatestTimeMs: number;
}) {
  const state = unwrapStateDatum(input.stateDatum, "Beneficiary distribution State");
  const errors = validateStateDatum(state);
  if (errors.length) {
    throw new Error(errors[0]);
  }
  const sections = readStateSections(state);
  if (sections.streamingPayments.length) {
    throw new Error("Exact distribution requires all streaming payments to be settled and removed first.");
  }
  if (!Number.isSafeInteger(input.txEarliestTimeMs) || input.txEarliestTimeMs < 0) {
    throw new Error("Exact distribution requires a finite non-negative earliest transaction time.");
  }
  if (!/^[0-9a-f]{64}$/i.test(input.sttInput.txHash) || !Number.isSafeInteger(input.sttInput.outputIndex) || input.sttInput.outputIndex < 0) {
    throw new Error("Exact distribution requires the consumed State transaction hash and output index.");
  }
  const beneficiaryId = deriveBeneficiaryWithdrawalId(state, input.beneficiarySignerKeyHash);
  const globalUnlock = readOptionalInteger(sections.unlockTime, "Proof of life unlock time");
  if (globalUnlock === null || BigInt(input.txEarliestTimeMs) < BigInt(globalUnlock)) {
    throw new Error("Every beneficiary must be unlocked before exact distribution.");
  }
  const beneficiaries = sections.beneficiaries as ConstrData[];
  const totalWeight = beneficiaries.reduce((total, record) => total + BigInt(readInteger(record.fields[3]!, "Beneficiary weight")), 0n);
  const entries = parseValueData(serializeAssetsToValueData(input.walletInputAmount), "Selected wallet value");
  if (!entries.length) {
    throw new Error("Exact distribution requires a nonempty selected wallet value.");
  }
  const payouts: BeneficiaryDistributionPayout[] = beneficiaries.map((record) => {
    const id = readInteger(record.fields[0]!, "Beneficiary id");
    const personalUnlock = readOptionalInteger(record.fields[2]!, "Beneficiary unlock after");
    if (personalUnlock !== null && BigInt(input.txEarliestTimeMs) < BigInt(personalUnlock)) {
      throw new Error(`Beneficiary ${id} is still locked. Every beneficiary must be unlocked before exact distribution.`);
    }
    const weight = BigInt(readInteger(record.fields[3]!, "Beneficiary weight"));
    const amount = entries.map((entry) => {
      const unit = partsToUnit(entry.policyId, entry.assetName);
      const weighted = entry.amount * weight;
      if (weighted % totalWeight !== 0n) {
        throw new Error(`Asset ${unit} cannot be split exactly for beneficiary ${id}. Prepare divisible quantities first.`);
      }
      return {
        unit,
        quantity: String(weighted / totalWeight)
      };
    }).filter(asset => asset.quantity !== "0");
    return {
      beneficiaryId: id,
      weight,
      address: decodePayoutAddressFromData(record.fields[4]!),
      amount,
      inlineDatum: {
        alternative: 0,
        fields: [id, input.sttInput.txHash.toLowerCase(), input.sttInput.outputIndex]
      }
    };
  });
  let outputDatum = state;
  if (beneficiaries.length === 1) {
    assertNonAdminStreamingActionWindow(state, input.txEarliestTimeMs, input.txLatestTimeMs, "Final beneficiary distribution");
    outputDatum = {
      ...state,
      fields: [...state.fields]
    };
    outputDatum.fields[5] = {
      alternative: 0,
      fields: [input.txLatestTimeMs]
    };
  }
  return {
    outputDatum,
    beneficiaryId,
    totalWeight,
    payouts
  };
}

export type BeneficiaryDistributionComputation = ReturnType<typeof deriveBeneficiaryDistributionStateDatum>;
