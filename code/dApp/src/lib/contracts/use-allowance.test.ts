import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveAllowanceWithdrawalStateDatum,
  nextProofOfLifeUnlockTimeForUser
} from "@/lib/contracts/use-allowance";
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

// The validator (proof_of_life.ak expect_valid_renewal_window) accepts a renewal
// only inside [tx_latest_time, tx_earliest_time + increment].
const RENEWING_USER = { canRenewProofOfLife: true, isAdmin: false };

test("proof-of-life renewal is anchored on the earliest tx time, not the latest", () => {
  const next = nextProofOfLifeUnlockTimeForUser(
    { proofOfLifeUnlockTime: 500_000, proofOfLifeIncrement: 3_600_000 },
    RENEWING_USER,
    1_000_000,
    1_360_000
  );
  assert.equal(next, 4_600_000);
});

test("proof-of-life renewal is skipped when the increment cannot reach the latest tx time", () => {
  // earliest + increment = 1_100_000 < latest, so no legal stamp exists for this tx.
  const next = nextProofOfLifeUnlockTimeForUser(
    { proofOfLifeUnlockTime: 500_000, proofOfLifeIncrement: 100_000 },
    RENEWING_USER,
    1_000_000,
    1_360_000
  );
  assert.equal(next, 500_000);
});

test("proof-of-life renewal never lowers a later existing unlock time", () => {
  const next = nextProofOfLifeUnlockTimeForUser(
    { proofOfLifeUnlockTime: 9_000_000, proofOfLifeIncrement: 3_600_000 },
    RENEWING_USER,
    1_000_000,
    1_360_000
  );
  assert.equal(next, 9_000_000);
});

test("admins and users without the renew right leave the unlock time alone", () => {
  const state = { proofOfLifeUnlockTime: 500_000, proofOfLifeIncrement: 3_600_000 };
  assert.equal(
    nextProofOfLifeUnlockTimeForUser(state, { canRenewProofOfLife: true, isAdmin: true }, 0, 1),
    500_000
  );
  assert.equal(
    nextProofOfLifeUnlockTimeForUser(state, { canRenewProofOfLife: false, isAdmin: false }, 0, 1),
    500_000
  );
});
