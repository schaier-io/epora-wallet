import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveAllowanceWithdrawalStateDatum } from "@/lib/contracts/use-allowance";
import type { ConstrData, PayoutTransfer } from "@/lib/types/contracts";

// These cover the input-validation guards on the allowance-withdrawal path,
// which fire before the state datum is parsed (so they need no datum fixture).
// The deeper allowance-math paths (reset-window anchoring, multi-user match)
// require a built state datum and are tracked separately.

const SIGNER = "ab".repeat(28);
const MINIMAL_STATE: ConstrData = { alternative: 0, fields: [] };

function transfer(quantity: string): PayoutTransfer {
  return { address: "addr_test1xexample", amount: [{ unit: "lovelace", quantity }] };
}

test("rejects an allowance withdrawal with no forwarded transfers", () => {
  assert.throws(
    () =>
      deriveAllowanceWithdrawalStateDatum({
        allowanceSignerKeyHash: SIGNER,
        extraTransfers: [],
        stateDatum: MINIMAL_STATE,
        txEarliestTimeMs: 0,
        txLatestTimeMs: 1,
        walletInputAmounts: [],
        walletOutputs: []
      }),
    /at least one positive forwarded transfer/
  );
});

test("rejects when requested assets exceed the selected wallet inputs", () => {
  assert.throws(
    () =>
      deriveAllowanceWithdrawalStateDatum({
        allowanceSignerKeyHash: SIGNER,
        extraTransfers: [transfer("2000000")],
        stateDatum: MINIMAL_STATE,
        txEarliestTimeMs: 0,
        txLatestTimeMs: 1,
        walletInputAmounts: [[{ unit: "lovelace", quantity: "1000000" }]],
        walletOutputs: []
      }),
    /exceeds the selected wallet inputs/
  );
});

test("requires a connected payment key hash", () => {
  assert.throws(
    () =>
      deriveAllowanceWithdrawalStateDatum({
        allowanceSignerKeyHash: "   ",
        extraTransfers: [transfer("1000000")],
        stateDatum: MINIMAL_STATE,
        txEarliestTimeMs: 0,
        txLatestTimeMs: 1,
        walletInputAmounts: [[{ unit: "lovelace", quantity: "1000000" }]],
        walletOutputs: []
      }),
    /payment key hash is required/
  );
});
