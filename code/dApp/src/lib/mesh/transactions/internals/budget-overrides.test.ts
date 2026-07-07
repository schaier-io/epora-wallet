import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyBudgetOverridesToBuilder,
  calculateCurrentFee,
  findAdjustableChangeOutputIndex,
  getPreparedOutputCount,
  rebalanceFeeAgainstChange
} from "@/lib/mesh/transactions/internals/budget-overrides";
import { type RuntimeTxBuilder } from "@/lib/mesh/transactions/internals/budget-runtime-builder";
import { type Transaction } from "@meshsdk/core";

const A = "a".repeat(64);
const B = "b".repeat(64);
const CHANGE = "addr_test1qchange";

// The fee↔change fixpoint is the most fund-safety-sensitive step of the manual
// budget override: it must never commit a fee that disagrees with the change
// output (an unbalanced tx). These tests pin that invariant.

test("returns immediately and applies once when the fee is already stable", () => {
  const applied: Array<{ fee: bigint; change: bigint }> = [];

  const fee = rebalanceFeeAgainstChange({
    originalLovelace: 5_000_000n,
    currentFee: 200_000n,
    initialFee: 200_000n,
    applyFeeAndChange: (f, change) => applied.push({ fee: f, change }),
    recalculateFee: () => 200_000n
  });

  assert.equal(fee, 200_000n);
  assert.deepEqual(applied, [{ fee: 200_000n, change: 5_000_000n }]);
});

test("converges over multiple passes and leaves fee + change value-conserving", () => {
  let committed = { fee: 0n, change: 0n };

  // After committing, the recalculated fee settles at 230_000.
  const fee = rebalanceFeeAgainstChange({
    originalLovelace: 5_000_000n,
    currentFee: 200_000n,
    initialFee: 220_000n,
    applyFeeAndChange: (f, change) => {
      committed = { fee: f, change };
    },
    recalculateFee: () => 230_000n
  });

  assert.equal(fee, 230_000n);
  // change must equal originalLovelace + currentFee - fee, or the tx is unbalanced.
  assert.equal(committed.fee, 230_000n);
  assert.equal(committed.change, 5_000_000n + 200_000n - 230_000n);
});

test("throws rather than emit an unbalanced tx when the fee never settles", () => {
  let call = 0;

  assert.throws(
    () =>
      rebalanceFeeAgainstChange({
        originalLovelace: 5_000_000n,
        currentFee: 200_000n,
        initialFee: 220_000n,
        applyFeeAndChange: () => {},
        // Oscillates forever — never equals the just-committed fee.
        recalculateFee: () => (call++ % 2 === 0 ? 230_000n : 240_000n)
      }),
    /did not converge/
  );
});

test("throws when the change output cannot cover the required fee", () => {
  assert.throws(
    () =>
      rebalanceFeeAgainstChange({
        originalLovelace: 100_000n,
        currentFee: 0n,
        initialFee: 500_000n, // exceeds originalLovelace + currentFee
        applyFeeAndChange: () => {},
        recalculateFee: () => 500_000n
      }),
    /higher fee than the available change output can cover/
  );
});

// applyBudgetOverridesToBuilder mutates the builder's redeemer exUnits in place;
// a mismatch here ships a tx whose declared budgets differ from what was priced.

test("applyBudgetOverridesToBuilder overrides matched spend/mint/reward budgets only", () => {
  const builder = {
    meshTxBuilderBody: {
      inputs: [
        { type: "Script", txIn: { txHash: A, txIndex: 0 }, scriptTxIn: { redeemer: { exUnits: { mem: 1, steps: 1 } } } },
        { type: "Script", txIn: { txHash: B, txIndex: 0 }, scriptTxIn: { redeemer: { exUnits: { mem: 2, steps: 2 } } } },
        { type: "PubKey", txIn: { txHash: A, txIndex: 9 } }
      ],
      mints: [{ type: "Plutus", redeemer: { exUnits: { mem: 1, steps: 1 } } }],
      withdrawals: [{ type: "ScriptWithdrawal", redeemer: { exUnits: { mem: 1, steps: 1 } } }]
    }
  } as unknown as RuntimeTxBuilder;

  applyBudgetOverridesToBuilder(builder, {
    spendBudgetsByRef: new Map([[`${A}#0`, { mem: 100, steps: 200 }]]),
    mintBudgets: [{ mem: 300, steps: 400 }],
    rewardBudgets: [{ mem: 500, steps: 600 }]
  });

  const body = builder.meshTxBuilderBody;
  assert.deepEqual(body.inputs![0]!.scriptTxIn!.redeemer!.exUnits, { mem: 100, steps: 200 });
  // No override for B#0 -> left untouched.
  assert.deepEqual(body.inputs![1]!.scriptTxIn!.redeemer!.exUnits, { mem: 2, steps: 2 });
  assert.deepEqual(body.mints![0]!.redeemer!.exUnits, { mem: 300, steps: 400 });
  assert.deepEqual(body.withdrawals![0]!.redeemer!.exUnits, { mem: 500, steps: 600 });
});

test("findAdjustableChangeOutputIndex prefers a clean change output at/after the prepared count", () => {
  const builder = {
    meshTxBuilderBody: {
      changeAddress: CHANGE,
      outputs: [
        { address: "addr_test1qrecipient", amount: [] },
        { address: CHANGE, amount: [], datum: { tag: 1 } }, // change addr but datum-bearing -> skipped
        { address: CHANGE, amount: [] }
      ]
    }
  } as unknown as RuntimeTxBuilder;

  assert.equal(findAdjustableChangeOutputIndex(builder, 1), 2);
});

test("findAdjustableChangeOutputIndex falls back to a change-addressed output and returns -1 when none exists", () => {
  const fallback = {
    meshTxBuilderBody: {
      changeAddress: CHANGE,
      outputs: [{ address: CHANGE, amount: [] }]
    }
  } as unknown as RuntimeTxBuilder;
  // prepared count exceeds every index, so only the address-based fallback predicates can match.
  assert.equal(findAdjustableChangeOutputIndex(fallback, 5), 0);

  const none = {
    meshTxBuilderBody: {
      changeAddress: CHANGE,
      outputs: [{ address: "addr_test1qother", amount: [] }]
    }
  } as unknown as RuntimeTxBuilder;
  assert.equal(findAdjustableChangeOutputIndex(none, 5), -1);
});

test("getPreparedOutputCount reads the builder output count, defaulting to zero", () => {
  assert.equal(
    getPreparedOutputCount({ txBuilder: { meshTxBuilderBody: { outputs: [{}, {}] } } } as unknown as Transaction),
    2
  );
  assert.equal(
    getPreparedOutputCount({ txBuilder: { meshTxBuilderBody: {} } } as unknown as Transaction),
    0
  );
});

test("calculateCurrentFee prefers calculateFee, then getActualFee, then the recorded fee", () => {
  assert.equal(
    calculateCurrentFee({ calculateFee: () => 5n, meshTxBuilderBody: {} } as unknown as RuntimeTxBuilder),
    5n
  );
  assert.equal(
    calculateCurrentFee({ getActualFee: () => 7n, meshTxBuilderBody: {} } as unknown as RuntimeTxBuilder),
    7n
  );
  assert.equal(
    calculateCurrentFee({ meshTxBuilderBody: { fee: "9" } } as unknown as RuntimeTxBuilder),
    9n
  );
});
