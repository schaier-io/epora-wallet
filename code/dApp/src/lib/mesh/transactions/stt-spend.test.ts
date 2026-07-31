import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveStreamingPayoutFundingSource } from "@/lib/mesh/transactions/stt-spend";

test("streaming payout builder uses connected-wallet funding with no wallet-script inputs", () => {
  assert.equal(resolveStreamingPayoutFundingSource(0), "connected-wallet");
});

test("streaming payout builder uses smart-wallet funding when wallet inputs are selected", () => {
  assert.equal(resolveStreamingPayoutFundingSource(2), "smart-wallet");
});
