import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deriveValidatedStreamingPaymentPayoutStateDatum,
  resolveStreamingPayoutFundingSource
} from "@/lib/mesh/transactions/stt-spend";
import { classifyStreamingPayoutBatch } from "@/lib/mesh/transactions/internals/streaming-payout-build";
import type { ConstrData, PayoutTransfer } from "@/lib/types/contracts";

const NONE: ConstrData = { alternative: 1, fields: [] };

function some(value: number): ConstrData {
  return { alternative: 0, fields: [value] };
}

function payoutState(lastNonAdminPayoutAt: number | null): ConstrData {
  return {
    alternative: 0,
    fields: [
      {
        alternative: 0,
        fields: [[], NONE, []]
      },
      {
        alternative: 0,
        fields: [NONE, NONE]
      },
      [
        {
          alternative: 0,
          fields: [
            1,
            { alternative: 0, fields: [] },
            0,
            "",
            "",
            86_400_000,
            0,
            10_000_000
          ]
        }
      ],
      "",
      NONE,
      lastNonAdminPayoutAt === null ? NONE : some(lastNonAdminPayoutAt)
    ]
  };
}

function payoutTransfers(): PayoutTransfer[] {
  return [
    {
      address: "",
      amount: [{ unit: "lovelace", quantity: "1000" }],
      inlineDatum: {
        alternative: 0,
        fields: [1, "00".repeat(32), 0]
      }
    }
  ];
}

test("streaming payout builder uses connected-wallet funding with no wallet-script inputs", () => {
  assert.equal(resolveStreamingPayoutFundingSource(0), "connected-wallet");
});

test("streaming payout builder uses smart-wallet funding when wallet inputs are selected", () => {
  assert.equal(resolveStreamingPayoutFundingSource(2), "smart-wallet");
});

test("streaming payout builder separates ADA-only and native-only batches", () => {
  assert.equal(classifyStreamingPayoutBatch(payoutTransfers()), "ada-only");
  assert.equal(
    classifyStreamingPayoutBatch([
      {
        ...payoutTransfers()[0]!,
        amount: [{ unit: `${"ab".repeat(28)}01`, quantity: "1" }]
      }
    ]),
    "native-only"
  );
});

test("streaming payout builder rejects mixed ADA and native batches", () => {
  assert.throws(
    () =>
      classifyStreamingPayoutBatch([
        ...payoutTransfers(),
        {
          ...payoutTransfers()[0]!,
          amount: [{ unit: `${"ab".repeat(28)}01`, quantity: "1" }]
        }
      ]),
    /separate transactions/
  );
});

test("cancel-stamped state blocks a non-admin payout during the shared cooldown", () => {
  const input = payoutState(1_000_000);

  assert.throws(
    () =>
      deriveValidatedStreamingPaymentPayoutStateDatum(
        input,
        payoutTransfers(),
        1_100_000,
        1_200_000,
        false
      ),
    /shared 30-minute receiver\/payout cooldown/
  );
});

test("non-admin payout builder rejects a validity window wider than one hour", () => {
  const input = payoutState(null);

  assert.throws(
    () =>
      deriveValidatedStreamingPaymentPayoutStateDatum(
        input,
        payoutTransfers(),
        100_000,
        3_700_001,
        false
      ),
    /validity window cannot exceed 60 minutes/
  );
});

test("admin preserve branch bypasses shared payout cadence and window cap", () => {
  const lastStamp = 1_000_000;
  const input = payoutState(lastStamp);

  const { outputDatum } = deriveValidatedStreamingPaymentPayoutStateDatum(
    input,
    payoutTransfers(),
    1_100_000,
    4_700_001,
    true
  );

  assert.deepEqual(outputDatum.fields[5], some(lastStamp));
});
