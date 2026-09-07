//// Off-chain transition checks for `ManageStreamingPayments` end-date edits.
//// The consumed State owns the no-clawback floor; validating only the output
//// shape misses edits that are individually well-formed but invalid relative
//// to the schedule being replaced.

import type { Data } from "@meshsdk/common";
import { isConstrData, readStateSections } from "@/lib/contracts/state-layout";
import { validateFreshStreamingPayments } from "@/lib/contracts/state-validation-streaming";
import type { ConstrData } from "@/lib/types/contracts";
import { createDefaultTranslator, defaultFormatter } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsStreamingManage.json";
import { isOnChainInteger } from "@/lib/contracts/on-chain-integer";

const i18n = createDefaultTranslator("LibContractsStreamingManage", defaultMessages);

function formatEndDateFloor(endDateFloor: bigint) {
  const timestamp = Number(endDateFloor);
  if (!Number.isSafeInteger(timestamp) || Number.isNaN(new Date(timestamp).getTime())) {
    return i18n("theRequiredOnChainCutoff");
  }
  return `${defaultFormatter.dateTime(timestamp, "short")} UTC`;
}

type ManagedPayment = {
  amountPerDay: bigint;
  assetName: string;
  endDate: bigint;
  id: bigint;
  paidOutAmount: bigint;
  payoutAddress: Data;
  policyId: string;
  startDate: bigint;
};

type ImmutableStreamingField =
  | "payoutAddress"
  | "paidOutAmount"
  | "policyId"
  | "assetName"
  | "amountPerDay"
  | "startDate";

function sameData(left: Data, right: Data): boolean {
  if (isOnChainInteger(left) && isOnChainInteger(right)) {
    return BigInt(left) === BigInt(right);
  }
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => sameData(entry, right[index]!))
    );
  }
  if (left instanceof Map || right instanceof Map) {
    if (!(left instanceof Map) || !(right instanceof Map) || left.size !== right.size) {
      return false;
    }
    return [...left].every(([leftKey, leftValue]) =>
      [...right].some(
        ([rightKey, rightValue]) =>
          sameData(leftKey, rightKey) && sameData(leftValue, rightValue)
      )
    );
  }
  if (isConstrData(left) && isConstrData(right)) {
    return (
      left.alternative === right.alternative &&
      left.fields.length === right.fields.length &&
      left.fields.every((field, index) => sameData(field, right.fields[index]!))
    );
  }
  return false;
}

function readManagedPayment(value: Data): ManagedPayment | null {
  if (!isConstrData(value) || value.fields.length !== 8) {
    return null;
  }
  const id = value.fields[0];
  const payoutAddress = value.fields[1];
  const paidOutAmount = value.fields[2];
  const policyId = value.fields[3];
  const assetName = value.fields[4];
  const amountPerDay = value.fields[5];
  const startDate = value.fields[6];
  const endDate = value.fields[7];
  if (
    !isOnChainInteger(id) ||
    !isOnChainInteger(paidOutAmount) ||
    typeof policyId !== "string" ||
    typeof assetName !== "string" ||
    !isOnChainInteger(amountPerDay) ||
    !isOnChainInteger(startDate) ||
    !isOnChainInteger(endDate)
  ) {
    return null;
  }
  return {
    amountPerDay: BigInt(amountPerDay),
    assetName,
    endDate: BigInt(endDate),
    id: BigInt(id),
    paidOutAmount: BigInt(paidOutAmount),
    payoutAddress,
    policyId,
    startDate: BigInt(startDate)
  };
}

function changedImmutableField(
  input: ManagedPayment,
  output: ManagedPayment
): ImmutableStreamingField | null {
  if (!sameData(input.payoutAddress, output.payoutAddress)) return "payoutAddress";
  if (input.paidOutAmount !== output.paidOutAmount) return "paidOutAmount";
  if (input.policyId !== output.policyId) return "policyId";
  if (input.assetName !== output.assetName) return "assetName";
  if (input.amountPerDay !== output.amountPerDay) return "amountPerDay";
  if (input.startDate !== output.startDate) return "startDate";
  return null;
}

function readManageTransition(
  inputStateDatum: ConstrData,
  outputStateDatum: ConstrData
): { input: ManagedPayment[]; outputById: Map<bigint, ManagedPayment> } | null {
  try {
    const input = readStateSections(
      inputStateDatum,
      "Manage streaming-payments input State datum"
    ).streamingPayments.flatMap((payment) => {
      const parsed = readManagedPayment(payment);
      return parsed ? [parsed] : [];
    });
    const outputById = new Map<bigint, ManagedPayment>();
    readStateSections(
      outputStateDatum,
      "Manage streaming-payments output State datum"
    ).streamingPayments.forEach((payment) => {
      const parsed = readManagedPayment(payment);
      if (parsed) {
        outputById.set(parsed.id, parsed);
      }
    });
    return { input, outputById };
  } catch {
    // General State validation reports malformed datum shapes.
    return null;
  }
}

function validateExistingManagedPayments(
  inputStateDatum: ConstrData,
  outputStateDatum: ConstrData,
  txLatestTimeMs: number | null
): string[] {
  const transition = readManageTransition(inputStateDatum, outputStateDatum);
  if (!transition) {
    return [];
  }

  const errors: string[] = [];
  transition.input.forEach((input) => {
    const output = transition.outputById.get(input.id);
    if (!output) {
      errors.push(
        i18n("existingStreamingPaymentValue1MustRemainInThe", { value1: input.id.toString() })
      );
      return;
    }

    const changedField = changedImmutableField(input, output);
    if (changedField) {
      errors.push(
        i18n("existingStreamingPaymentValue1MustKeepItsImmutable", {
          value1: input.id.toString(),
          field: changedField
        })
      );
    }

    if (txLatestTimeMs === null) {
      // Callers without a transaction time can only enforce the start+1 floor.
      // Render-time and builder-time callers pass the current upper validity bound.
      if (input.endDate > input.startDate && output.endDate === input.startDate) {
        errors.push(
          i18n("existingStreamingPaymentValue1CannotBeShortenedTo", { value1: input.id.toString() })
        );
      }
      return;
    }

    const endDateFloor =
      input.endDate === input.startDate
        ? input.startDate
        : (() => {
            const txFloor = input.endDate < BigInt(txLatestTimeMs)
              ? input.endDate
              : BigInt(txLatestTimeMs);
            return input.startDate + 1n > txFloor ? input.startDate + 1n : txFloor;
          })();
    if (output.endDate < endDateFloor) {
      errors.push(
        i18n("existingStreamingPaymentValue1EndDateMustBe", {
          value1: input.id.toString(),
          endDateFloor: formatEndDateFloor(endDateFloor)
        })
      );
    }
  });
  return errors;
}

/**
 * Exact builder-time mirror of the on-chain Manage end-date floor. Fresh ids
 * must be unpaid and positive-duration; existing ids use the consumed schedule
 * and this transaction's finite upper validity bound.
 */
export function validateManagedStreamingPayments(
  inputStateDatum: ConstrData,
  outputStateDatum: ConstrData,
  txLatestTimeMs: number,
  walletPaymentScriptHash: string,
  sttPolicyId: string
): string[] {
  const errors = validateFreshStreamingPayments(
    inputStateDatum,
    outputStateDatum,
    walletPaymentScriptHash,
    sttPolicyId
  );
  if (!Number.isSafeInteger(txLatestTimeMs) || txLatestTimeMs < 0) {
    errors.push(
      i18n("managingStreamingPaymentsRequiresANonNegativeSafe")
    );
    return errors;
  }
  errors.push(
    ...validateExistingManagedPayments(
      inputStateDatum,
      outputStateDatum,
      txLatestTimeMs
    )
  );
  return errors;
}

/**
 * Render-time validation uses the current transaction upper bound when supplied.
 * Builder-time validation repeats the same floor check against its exact validity window.
 */
export function validateManagedStreamingPaymentsStatic(
  inputStateDatum: ConstrData,
  outputStateDatum: ConstrData,
  sttPolicyId?: string,
  txLatestTimeMs: number | null = null
): string[] {
  return [
    ...validateFreshStreamingPayments(
      inputStateDatum,
      outputStateDatum,
      undefined,
      sttPolicyId
    ),
    ...validateExistingManagedPayments(inputStateDatum, outputStateDatum, txLatestTimeMs)
  ];
}
