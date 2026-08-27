import assert from "node:assert/strict";
import test from "node:test";

import {
  validateManagedStreamingPayments,
  validateManagedStreamingPaymentsStatic
} from "@/lib/contracts/streaming-manage";
import type { ConstrData } from "@/lib/types/contracts";

const NONE: ConstrData = { alternative: 1, fields: [] };
const PAYOUT_ADDRESS: ConstrData = {
  alternative: 0,
  fields: [
    { alternative: 0, fields: ["aa".repeat(28)] },
    NONE
  ]
};

function payment(
  id: number,
  paidOutAmount: number,
  startDate: number,
  endDate: number
): ConstrData {
  return {
    alternative: 0,
    fields: [
      id,
      PAYOUT_ADDRESS,
      paidOutAmount,
      "",
      "",
      1_000_000,
      startDate,
      endDate
    ]
  };
}

function state(streamingPayments: ConstrData[]): ConstrData {
  return {
    alternative: 0,
    fields: [
      { alternative: 0, fields: [[], NONE, []] },
      { alternative: 0, fields: [NONE, NONE] },
      streamingPayments,
      "",
      NONE,
      NONE
    ]
  };
}

function hasError(errors: string[], pattern: RegExp): boolean {
  return errors.some((error) => pattern.test(error));
}

test("positive-duration existing stream cannot be edited to equality", () => {
  const input = state([payment(1, 0, 700, 1_000)]);
  const output = state([payment(1, 0, 700, 700)]);

  assert.ok(
    hasError(
      validateManagedStreamingPaymentsStatic(input, output),
      /must end after it starts/
    )
  );
  assert.ok(
    hasError(
      validateManagedStreamingPayments(input, output, 600),
      /cannot end before its accrued amount is protected/
    )
  );
});

test("existing stream uses the exact transaction no-clawback floor", () => {
  const input = state([payment(1, 0, 100, 1_000)]);

  assert.ok(
    hasError(
      validateManagedStreamingPayments(
        input,
        state([payment(1, 0, 100, 599)]),
        600
      ),
      /cannot end before its accrued amount is protected/
    )
  );
  assert.deepEqual(
    validateManagedStreamingPayments(
      input,
      state([payment(1, 0, 100, 600)]),
      600
    ),
    []
  );

  // Once txLatest is beyond the old end, min(input.end, txLatest) preserves the
  // old end as the floor rather than forcing an extension into the future.
  assert.ok(
    hasError(
      validateManagedStreamingPayments(
        input,
        state([payment(1, 0, 100, 999)]),
        1_200
      ),
      /cannot end before its accrued amount is protected/
    )
  );
  assert.deepEqual(
    validateManagedStreamingPayments(
      input,
      state([payment(1, 0, 100, 1_000)]),
      1_200
    ),
    []
  );
});

test("existing zero-duration stream may be preserved or extended", () => {
  const input = state([payment(1, 0, 700, 700)]);
  const preserved = state([payment(1, 0, 700, 700)]);
  const extended = state([payment(1, 0, 700, 900)]);

  assert.deepEqual(
    validateManagedStreamingPaymentsStatic(input, preserved),
    []
  );
  assert.deepEqual(
    validateManagedStreamingPayments(input, preserved, 800),
    []
  );
  assert.deepEqual(
    validateManagedStreamingPayments(input, extended, 800),
    []
  );
});

test("fresh ids remain unpaid and positive-duration", () => {
  const input = state([]);

  assert.deepEqual(
    validateManagedStreamingPayments(
      input,
      state([payment(2, 0, 100, 101)]),
      50
    ),
    []
  );
  assert.ok(
    hasError(
      validateManagedStreamingPayments(
        input,
        state([payment(2, 0, 100, 100)]),
        50
      ),
      /must start before it ends/
    )
  );
  assert.ok(
    hasError(
      validateManagedStreamingPayments(
        input,
        state([payment(2, 0, 101, 100)]),
        50
      ),
      /must start before it ends/
    )
  );
  assert.ok(
    hasError(
      validateManagedStreamingPayments(
        input,
        state([payment(2, 1, 100, 101)]),
        50
      ),
      /must start with 0 already paid/
    )
  );
});
