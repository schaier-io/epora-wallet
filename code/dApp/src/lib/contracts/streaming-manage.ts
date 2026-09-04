//// Off-chain transition checks for `ManageStreamingPayments` end-date edits.
//// The consumed State owns the no-clawback floor; validating only the output
//// shape misses edits that are individually well-formed but invalid relative
//// to the schedule being replaced.

import type { Data } from "@meshsdk/common";
import { isConstrData, readStateSections } from "@/lib/contracts/state-layout";
import { validateFreshStreamingPayments } from "@/lib/contracts/state-validation";
import type { ConstrData } from "@/lib/types/contracts";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsStreamingManage.json";

const i18n = createDefaultTranslator("LibContractsStreamingManage", defaultMessages);

type ManagedPayment = {
  amountPerDay: number;
  assetName: string;
  endDate: number;
  id: number;
  paidOutAmount: number;
  payoutAddress: Data;
  policyId: string;
  startDate: number;
};

function sameData(left: Data, right: Data): boolean {
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
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    typeof paidOutAmount !== "number" ||
    !Number.isSafeInteger(paidOutAmount) ||
    typeof policyId !== "string" ||
    typeof assetName !== "string" ||
    typeof amountPerDay !== "number" ||
    !Number.isSafeInteger(amountPerDay) ||
    typeof startDate !== "number" ||
    !Number.isSafeInteger(startDate) ||
    typeof endDate !== "number" ||
    !Number.isSafeInteger(endDate)
  ) {
    return null;
  }
  return {
    amountPerDay,
    assetName,
    endDate,
    id,
    paidOutAmount,
    payoutAddress,
    policyId,
    startDate
  };
}

function changedImmutableField(input: ManagedPayment, output: ManagedPayment): string | null {
  if (!sameData(input.payoutAddress, output.payoutAddress)) return "payout address";
  if (input.paidOutAmount !== output.paidOutAmount) return "already-paid amount";
  if (input.policyId !== output.policyId) return "policy id";
  if (input.assetName !== output.assetName) return "asset name";
  if (input.amountPerDay !== output.amountPerDay) return "daily rate";
  if (input.startDate !== output.startDate) return "start date";
  return null;
}

function readManageTransition(
  inputStateDatum: ConstrData,
  outputStateDatum: ConstrData
): { input: ManagedPayment[]; outputById: Map<number, ManagedPayment> } | null {
  try {
    const input = readStateSections(
      inputStateDatum,
      "Manage streaming-payments input State datum"
    ).streamingPayments.flatMap((payment) => {
      const parsed = readManagedPayment(payment);
      return parsed ? [parsed] : [];
    });
    const outputById = new Map<number, ManagedPayment>();
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
        i18n("existingStreamingPaymentValue1MustRemainInThe", { value1: input.id })
      );
      return;
    }

    const changedField = changedImmutableField(input, output);
    if (changedField) {
      errors.push(
        i18n("existingStreamingPaymentValue1MustKeepItsImmutable", {
          value1: input.id,
          field: changedField
        })
      );
    }

    if (txLatestTimeMs === null) {
      // Static UI guard: a positive-duration input uses the operator-only
      // start+1 floor. Equality is valid only when the INPUT was already the
      // receiver-created zero-duration form.
      if (input.endDate > input.startDate && output.endDate === input.startDate) {
        errors.push(
          i18n("existingStreamingPaymentValue1CannotBeShortenedTo", { value1: input.id })
        );
      }
      return;
    }

    const endDateFloor =
      input.endDate === input.startDate
        ? input.startDate
        : Math.max(
            input.startDate + 1,
            Math.min(input.endDate, txLatestTimeMs)
          );
    if (output.endDate < endDateFloor) {
      errors.push(
        i18n("existingStreamingPaymentValue1EndDateMustBe", { value1: input.id, endDateFloor })
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
  txLatestTimeMs: number
): string[] {
  const errors = validateFreshStreamingPayments(inputStateDatum, outputStateDatum);
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
 * Render-time subset that catches the dangerous positive-duration → equality
 * edit without rejecting an existing zero-duration schedule forwarded as-is.
 * The builder performs the final time-dependent floor check above.
 */
export function validateManagedStreamingPaymentsStatic(
  inputStateDatum: ConstrData,
  outputStateDatum: ConstrData
): string[] {
  return [
    ...validateFreshStreamingPayments(inputStateDatum, outputStateDatum),
    ...validateExistingManagedPayments(inputStateDatum, outputStateDatum, null)
  ];
}
