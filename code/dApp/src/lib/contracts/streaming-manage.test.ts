import assert from "node:assert/strict";
import test from "node:test";

import {
  validateManagedStreamingPayments as validateManagedStreamingPaymentsForWallet,
  validateManagedStreamingPaymentsStatic
} from "@/lib/contracts/streaming-manage";
import type { OnChainInteger } from "@/lib/contracts/on-chain-integer";
import type { ConstrData } from "@/lib/types/contracts";

const NONE: ConstrData = { alternative: 1, fields: [] };
const WALLET_SCRIPT_HASH = "ff".repeat(28);
const STT_POLICY_ID = "dd".repeat(28);
const PAYOUT_ADDRESS: ConstrData = {
  alternative: 0,
  fields: [
    { alternative: 0, fields: ["aa".repeat(28)] },
    NONE
  ]
};

function payment(
  id: OnChainInteger,
  paidOutAmount: OnChainInteger,
  startDate: OnChainInteger,
  endDate: OnChainInteger,
  payoutAddress: ConstrData = PAYOUT_ADDRESS
): ConstrData {
  return {
    alternative: 0,
    fields: [
      id,
      payoutAddress,
      paidOutAmount,
      "",
      "",
      1_000_000,
      startDate,
      endDate
    ]
  };
}

function scriptAddress(
  paymentScriptHash: string,
  stakeOption: ConstrData = NONE
): ConstrData {
  return {
    alternative: 0,
    fields: [
      { alternative: 1, fields: [paymentScriptHash] },
      stakeOption
    ]
  };
}

function validateManagedStreamingPayments(
  inputStateDatum: ConstrData,
  outputStateDatum: ConstrData,
  txLatestTimeMs: number
): string[] {
  return validateManagedStreamingPaymentsForWallet(
    inputStateDatum,
    outputStateDatum,
    txLatestTimeMs,
    WALLET_SCRIPT_HASH,
    STT_POLICY_ID
  );
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
      /cannot be shortened to zero duration/
    )
  );
  assert.ok(
    hasError(
      validateManagedStreamingPayments(input, output, 600),
      /must stop at or after .* UTC\. Stop as soon as possible again/
    )
  );
});

test("existing stream uses the exact transaction no-clawback floor", () => {
  const input = state([payment(1, 0, 100, 1_000)]);

  const tooEarly = validateManagedStreamingPayments(
    input,
    state([payment(1, 0, 100, 599)]),
    600
  );
  assert.ok(hasError(tooEarly, /must stop at or after .* UTC/));
  assert.ok(hasError(tooEarly, /choose a later stop time/i));
  assert.ok(tooEarly.every((error) => !error.includes("600")));
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
      /must stop at or after .* UTC/
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

test("render-time validation uses the same transaction end-date floor", () => {
  const input = state([payment(1, 0, 100, 1_000)]);
  const output = state([payment(1, 0, 100, 599)]);

  assert.ok(
    hasError(
      validateManagedStreamingPaymentsStatic(input, output, undefined, 600),
      /must stop at or after .* UTC/
    )
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

test("equal streaming fields compare exactly across number and bigint representations", () => {
  const inputPayment = payment(1, 0, 100, 1_000);
  const outputPayment = payment(1n, 0n, 100n, 1_000n);
  outputPayment.fields[5] = 1_000_000n;

  assert.deepEqual(
    validateManagedStreamingPaymentsStatic(
      state([inputPayment]),
      state([outputPayment])
    ),
    []
  );
  assert.deepEqual(
    validateManagedStreamingPayments(
      state([inputPayment]),
      state([outputPayment]),
      600
    ),
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
      /must start with zero already-paid amount/
    )
  );
});

test("fresh streams cannot use the wallet payment credential across stake variants", () => {
  const input = state([]);
  const stakeVariant: ConstrData = {
    alternative: 0,
    fields: [
      {
        alternative: 0,
        fields: [{ alternative: 0, fields: ["11".repeat(28)] }]
      }
    ]
  };

  for (const payoutAddress of [
    scriptAddress(WALLET_SCRIPT_HASH),
    scriptAddress(WALLET_SCRIPT_HASH, stakeVariant)
  ]) {
    assert.ok(
      hasError(
        validateManagedStreamingPayments(
          input,
          state([payment(2, 0, 100, 101, payoutAddress)]),
          50
        ),
        /cannot pay to this smart wallet/i
      )
    );
  }
});

test("fresh streams cannot use the STT policy, but existing streams stay manageable", () => {
  const matchingPolicy = payment(2, 0, 100, 101);
  matchingPolicy.fields[3] = STT_POLICY_ID.toUpperCase();
  const input = state([]);
  const output = state([matchingPolicy]);

  assert.ok(
    hasError(
      validateManagedStreamingPayments(input, output, 50),
      /cannot use this wallet.*policy/i
    )
  );
  assert.ok(
    hasError(
      validateManagedStreamingPaymentsStatic(input, output, STT_POLICY_ID),
      /cannot use this wallet.*policy/i
    )
  );
  assert.deepEqual(
    validateManagedStreamingPayments(
      state([matchingPolicy]),
      state([matchingPolicy]),
      50
    ),
    []
  );
});

test("fresh key and unrelated script payout addresses remain valid", () => {
  const input = state([]);

  for (const payoutAddress of [
    PAYOUT_ADDRESS,
    scriptAddress("ee".repeat(28))
  ]) {
    assert.deepEqual(
      validateManagedStreamingPayments(
        input,
        state([payment(2, 0, 100, 101, payoutAddress)]),
        50
      ),
      []
    );
  }
});

test("an existing self-addressed stream remains manageable", () => {
  const existing = payment(
    1,
    0,
    100,
    1_000,
    scriptAddress(WALLET_SCRIPT_HASH)
  );

  assert.deepEqual(
    validateManagedStreamingPayments(
      state([existing]),
      state([existing]),
      600
    ),
    []
  );
});

test("existing streams preserve every immutable contract field", () => {
  const original = payment(1, 0, 100, 1_000);
  const mutations: Array<{ field: string; index: number; value: ConstrData["fields"][number] }> = [
    {
      field: "payout address",
      index: 1,
      value: {
        alternative: 0,
        fields: [{ alternative: 0, fields: ["bb".repeat(28)] }, NONE]
      }
    },
    { field: "already-paid amount", index: 2, value: 1 },
    { field: "policy id", index: 3, value: "aa".repeat(28) },
    { field: "asset name", index: 4, value: "01" },
    { field: "daily rate", index: 5, value: 2_000_000 },
    { field: "start date", index: 6, value: 101 }
  ];

  mutations.forEach(({ field, index, value }) => {
    const fields = [...original.fields];
    fields[index] = value;
    const output = state([{ ...original, fields }]);

    assert.ok(
      hasError(validateManagedStreamingPaymentsStatic(state([original]), output), new RegExp(field)),
      `${field} mutation must fail static validation`
    );
    assert.ok(
      hasError(validateManagedStreamingPayments(state([original]), output, 600), new RegExp(field)),
      `${field} mutation must fail builder validation`
    );
  });
});
