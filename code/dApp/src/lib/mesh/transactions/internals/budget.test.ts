import assert from "node:assert/strict";
import { test } from "node:test";
import { rebalanceFeeAgainstChange } from "@/lib/mesh/transactions/internals/budget";

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
