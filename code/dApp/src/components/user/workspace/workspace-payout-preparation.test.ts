import assert from "node:assert/strict";
import test from "node:test";

import { prepareStreamingPaymentPayout } from "@/components/user/workspace/workspace-payout-preparation";
import type { PayoutTransfer } from "@/lib/types/contracts";

function payoutTransfer(quantity: string): PayoutTransfer {
  return {
    address: "addr_test1vrpayout",
    amount: [{ unit: "lovelace", quantity }],
    inlineDatum: {
      alternative: 0,
      fields: [7, "a".repeat(64), 0]
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
