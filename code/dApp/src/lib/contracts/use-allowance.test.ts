import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveAllowanceWithdrawalStateDatum } from "@/lib/contracts/use-allowance";
import {
  createDefaultStateForm,
  stateFormFromDatum,
  stateFormToDatum
} from "@/lib/contracts/state-form";
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

// The renewal bound, pinned against the validator.
//
// `lib/state/proof_of_life.ak :: expect_valid_renewal_window` accepts a moved
// `unlock_time` only inside `[tx_latest, tx_earliest + increment]`. Anchoring
// the renewed stamp to the tx's LATEST time overshoots the upper bound by the
// validity window's own width, so every renewing allowance spend was rejected
// on-chain with an empty script trace.

const TX_EARLIEST_MS = 1_750_000_000_000;
const TX_LATEST_MS = TX_EARLIEST_MS + 360_000;
const POL_INCREMENT_MS = 30 * 86_400_000;

function allowanceStateDatum(options: {
  unlockTime: number;
  increment: number;
}): ConstrData {
  const form = createDefaultStateForm();
  form.users = [
    {
      id: "1",
      wallets: [SIGNER],
      perDayAllowance: [{ policyId: "", assetName: "", amount: "5000000" }],
      remainingAllowance: [{ policyId: "", assetName: "", amount: "5000000" }],
      nextAllowanceReset: `${TX_LATEST_MS + 86_400_000}`,
      canRenewProofOfLife: true,
      multiSigPowerMode: "none",
      multiSigPower: "",
      isAdmin: false,
      preset: "limited-withdrawal"
    }
  ];
  form.proofOfLifeUnlockTimeMode = "some";
  form.proofOfLifeUnlockTime = `${options.unlockTime}`;
  form.proofOfLifeIncrementMode = "some";
  form.proofOfLifeIncrement = `${options.increment}`;
  return stateFormToDatum(form);
}

function renewedUnlockTime(datum: ConstrData) {
  const { outputDatum } = deriveAllowanceWithdrawalStateDatum({
    allowanceSignerKeyHash: SIGNER,
    extraTransfers: [transfer("1000000")],
    stateDatum: datum,
    txEarliestTimeMs: TX_EARLIEST_MS,
    txLatestTimeMs: TX_LATEST_MS,
    walletInputAmounts: [[{ unit: "lovelace", quantity: "1000000" }]],
    walletOutputs: []
  });
  return stateFormFromDatum(outputDatum).proofOfLifeUnlockTime;
}

test("renewal stamps the tx EARLIEST time plus the increment, the largest stamp the validator accepts", () => {
  const stamp = renewedUnlockTime(
    allowanceStateDatum({ unlockTime: TX_EARLIEST_MS, increment: POL_INCREMENT_MS })
  );

  assert.equal(stamp, `${TX_EARLIEST_MS + POL_INCREMENT_MS}`);
  // The bound the validator checks: `updated <= tx_earliest + increment`.
  assert.ok(Number(stamp) <= TX_EARLIEST_MS + POL_INCREMENT_MS);
  // ...and the lower bound: `updated >= tx_latest`.
  assert.ok(Number(stamp) >= TX_LATEST_MS);
});

test("renewal leaves the stamp untouched when the increment is shorter than the validity window", () => {
  // No value exists inside [tx_latest, tx_earliest + increment], so renewing is
  // impossible; an unchanged unlock_time passes the check trivially.
  const stamp = renewedUnlockTime(
    allowanceStateDatum({ unlockTime: TX_EARLIEST_MS, increment: 1_000 })
  );

  assert.equal(stamp, `${TX_EARLIEST_MS}`);
});

test("renewal never decreases an unlock time that is already further out", () => {
  const farFuture = TX_EARLIEST_MS + POL_INCREMENT_MS * 2;
  const stamp = renewedUnlockTime(
    allowanceStateDatum({ unlockTime: farFuture, increment: POL_INCREMENT_MS })
  );

  assert.equal(stamp, `${farFuture}`);
});
