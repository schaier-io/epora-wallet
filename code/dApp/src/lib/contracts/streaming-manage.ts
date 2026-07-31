//// Off-chain transition checks for `ManageStreamingPayments` end-date edits.
//// The consumed State owns the no-clawback floor; validating only the output
//// shape misses edits that are individually well-formed but invalid relative
//// to the schedule being replaced.

import type { Data } from "@meshsdk/common";
import { isConstrData, readStateSections } from "@/lib/contracts/state-layout";
import { validateFreshStreamingPayments } from "@/lib/contracts/state-validation";
import type { ConstrData } from "@/lib/types/contracts";

type ManagedPayment = {
  endDate: number;
  id: number;
  startDate: number;
};

function readManagedPayment(value: Data): ManagedPayment | null {
  if (!isConstrData(value) || value.fields.length !== 8) {
    return null;
  }
  const id = value.fields[0];
  const startDate = value.fields[6];
  const endDate = value.fields[7];
  if (
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    typeof startDate !== "number" ||
    !Number.isSafeInteger(startDate) ||
    typeof endDate !== "number" ||
    !Number.isSafeInteger(endDate)
  ) {
    return null;
  }
  return { endDate, id, startDate };
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
        `Existing streaming payment ${input.id} must remain in the managed State.`
      );
      return;
    }

    if (txLatestTimeMs === null) {
      // Static UI guard: a positive-duration input uses the operator-only
      // start+1 floor. Equality is valid only when the INPUT was already the
      // receiver-created zero-duration form.
      if (input.endDate > input.startDate && output.endDate === input.startDate) {
        errors.push(
          `Existing streaming payment ${input.id} cannot be shortened to zero duration.`
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
        `Existing streaming payment ${input.id} end date must be at least ${endDateFloor} for this transaction.`
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
      "Managing streaming payments requires a non-negative safe transaction upper-bound time."
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
