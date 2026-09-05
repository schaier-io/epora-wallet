import assert from "node:assert/strict";
import test from "node:test";

import { prepareStreamingPaymentPayout } from "@/components/user/workspace/workspace-payout-preparation";
import type { PayoutTransfer } from "@/lib/types/contracts";

function payoutTransfer(quantity: string, id: number | bigint = 7): PayoutTransfer {
  return {
    address: "addr_test1vrpayout",
    amount: [{ unit: "lovelace", quantity }],
    inlineDatum: {
      alternative: 0,
      fields: [id, "a".repeat(64), 0]
    }
  };
}

test("scheduled payout preparation snapshots transfers and their identity", () => {
  const source = [payoutTransfer("1000000")];
  const prepared = prepareStreamingPaymentPayout(source);

  source[0]!.amount[0]!.quantity = "2000000";

  assert.equal(prepared.extraTransfers[0]!.amount[0]!.quantity, "1000000");
  assert.notEqual(
    prepareStreamingPaymentPayout(source).identity,
    prepared.identity
  );
});

test("scheduled payout identities distinguish exact bigint ids", () => {
  const maximum = 18_446_744_073_709_551_615n;
  const first = prepareStreamingPaymentPayout([payoutTransfer("1", maximum)]);
  const second = prepareStreamingPaymentPayout([payoutTransfer("1", maximum - 1n)]);

  assert.notEqual(first.identity, "[object Object]");
  assert.notEqual(first.identity, second.identity);
});
