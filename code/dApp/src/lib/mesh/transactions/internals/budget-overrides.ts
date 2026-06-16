import {
  assertRuntimeBuilderShape,
  type RedeemerBudgetOverrides,
  type RuntimeTxBuilder
} from "./budget-runtime-builder";
import { createInputRefKey } from "./utxo";
import { getLovelaceQuantity, setLovelaceQuantity } from "./value";
import { type Budget } from "@meshsdk/common";
import { type Transaction } from "@meshsdk/core";

export function getPreparedOutputCount(tx: Transaction) {
  const txBuilder = tx.txBuilder as RuntimeTxBuilder;
  return txBuilder.meshTxBuilderBody.outputs?.length ?? 0;
}



function cloneBudget(budget: Budget): Budget {
  return {
    mem: budget.mem,
    steps: budget.steps
  };
}



export function applyBudgetOverridesToBuilder(
  txBuilder: RuntimeTxBuilder,
  overrides: RedeemerBudgetOverrides
) {
  const inputs = txBuilder.meshTxBuilderBody.inputs ?? [];
  const mints = txBuilder.meshTxBuilderBody.mints ?? [];
  const withdrawals = txBuilder.meshTxBuilderBody.withdrawals ?? [];
  let mintBudgetIndex = 0;
  let rewardBudgetIndex = 0;

  for (const input of inputs) {
    const txHash = input.txIn?.txHash;
    const txIndex = input.txIn?.txIndex;
    const currentBudget = input.scriptTxIn?.redeemer?.exUnits;

    if (
      input.type !== "Script" ||
      !txHash ||
      typeof txIndex !== "number" ||
      !currentBudget
    ) {
      continue;
    }

    const nextBudget = overrides.spendBudgetsByRef.get(
      createInputRefKey(txHash, txIndex)
    );

    if (!nextBudget) {
      continue;
    }

    input.scriptTxIn.redeemer!.exUnits = cloneBudget(nextBudget);
  }

  for (const mint of mints) {
    const currentBudget = mint.redeemer?.exUnits;

    if (mint.type !== "Plutus" || !currentBudget) {
      continue;
    }

    const nextBudget = overrides.mintBudgets[mintBudgetIndex];
    mintBudgetIndex += 1;

    if (!nextBudget) {
      continue;
    }

    mint.redeemer!.exUnits = cloneBudget(nextBudget);
  }

  for (const withdrawal of withdrawals) {
    const currentBudget = withdrawal.redeemer?.exUnits;

    if (withdrawal.type !== "ScriptWithdrawal" || !currentBudget) {
      continue;
    }

    const nextBudget = overrides.rewardBudgets[rewardBudgetIndex];
    rewardBudgetIndex += 1;

    if (!nextBudget) {
      continue;
    }

    withdrawal.redeemer!.exUnits = cloneBudget(nextBudget);
  }
}



export function findAdjustableChangeOutputIndex(
  txBuilder: RuntimeTxBuilder,
  preparedOutputCount: number
) {
  const outputs = txBuilder.meshTxBuilderBody.outputs ?? [];
  const changeAddress = txBuilder.meshTxBuilderBody.changeAddress;
  const candidatePredicates = [
    (index: number, output: { address?: string; datum?: unknown }) =>
      index >= preparedOutputCount &&
      typeof changeAddress === "string" &&
      output.address === changeAddress &&
      typeof output.datum === "undefined",
    (index: number, output: { address?: string }) =>
      index >= preparedOutputCount &&
      typeof changeAddress === "string" &&
      output.address === changeAddress,
    (index: number) => index >= preparedOutputCount,
    (_index: number, output: { address?: string; datum?: unknown }) =>
      typeof changeAddress === "string" &&
      output.address === changeAddress &&
      typeof output.datum === "undefined",
    (_index: number, output: { address?: string }) =>
      typeof changeAddress === "string" && output.address === changeAddress
  ] as const;

  for (const predicate of candidatePredicates) {
    const candidateIndex = outputs.findIndex((output, index) =>
      predicate(index, output)
    );

    if (candidateIndex >= 0) {
      return candidateIndex;
    }
  }

  return -1;
}



export function calculateCurrentFee(txBuilder: RuntimeTxBuilder) {
  if (typeof txBuilder.calculateFee === "function") {
    return txBuilder.calculateFee();
  }

  if (typeof txBuilder.getActualFee === "function") {
    return txBuilder.getActualFee();
  }

  return BigInt(txBuilder.meshTxBuilderBody.fee ?? "0");
}



// Fee and change feed back into each other (a bigger fee shrinks change, which
// changes the tx size, which changes the fee). The fixpoint converges in 1–2
// passes in practice; the cap is a safety bound. If it is ever hit we refuse to
// emit the tx rather than commit a fee that doesn't match the change output.
const MAX_FEE_REBALANCE_ITERATIONS = 8;

// Pure fixpoint driver for the fee↔change rebalance, factored out of the Mesh
// builder mutation so the fund-safety invariant can be unit-tested. Each pass
// commits a candidate (fee, change) via `applyFeeAndChange`, then asks
// `recalculateFee` for the fee implied by that committed state; it returns once
// the fee stops moving. Throws — rather than returning a mismatched fee — when
// the change can't cover the fee or the fixpoint doesn't settle within the cap.
export function rebalanceFeeAgainstChange(params: {
  originalLovelace: bigint;
  currentFee: bigint;
  initialFee: bigint;
  applyFeeAndChange: (fee: bigint, change: bigint) => void;
  recalculateFee: () => bigint;
  maxIterations?: number;
}): bigint {
  const { originalLovelace, currentFee, applyFeeAndChange, recalculateFee } = params;
  const maxIterations = params.maxIterations ?? MAX_FEE_REBALANCE_ITERATIONS;
  let nextFee = params.initialFee;

  for (let attempt = 0; attempt < maxIterations; attempt += 1) {
    const rebalancedLovelace = originalLovelace + currentFee - nextFee;

    if (rebalancedLovelace < 0n) {
      throw new Error(
        "The manual redeemer budget override would require a higher fee than the available change output can cover."
      );
    }

    applyFeeAndChange(nextFee, rebalancedLovelace);

    const recalculatedFee = recalculateFee();
    if (recalculatedFee === nextFee) {
      return nextFee;
    }

    nextFee = recalculatedFee;
  }

  // On non-convergence the committed fee would no longer match the change
  // output (last balanced against the previous iteration's fee) — an unbalanced
  // tx. Fail loudly instead of emitting it.
  throw new Error(
    "Fee re-estimation did not converge after applying manual redeemer budgets; " +
      "refusing to emit an unbalanced transaction."
  );
}

export function applyManualBudgetOverrides(
  tx: Transaction,
  overrides: RedeemerBudgetOverrides,
  preparedOutputCount: number
) {
  const txBuilder = tx.txBuilder as RuntimeTxBuilder;
  assertRuntimeBuilderShape(txBuilder);
  const outputs = txBuilder.meshTxBuilderBody.outputs ?? [];
  const currentFee = BigInt(txBuilder.meshTxBuilderBody.fee ?? "0");

  applyBudgetOverridesToBuilder(txBuilder, overrides);

  let nextFee = calculateCurrentFee(txBuilder);

  if (nextFee !== currentFee) {
    const changeOutputIndex = findAdjustableChangeOutputIndex(
      txBuilder,
      preparedOutputCount
    );

    if (changeOutputIndex < 0) {
      throw new Error(
        "Could not locate a change output to rebalance the transaction after applying manual redeemer budgets."
      );
    }

    const changeOutput = outputs[changeOutputIndex];
    if (!changeOutput) {
      throw new Error(
        "Could not locate the selected change output after applying manual redeemer budgets."
      );
    }

    const originalLovelace = getLovelaceQuantity(changeOutput.amount);

    nextFee = rebalanceFeeAgainstChange({
      originalLovelace,
      currentFee,
      initialFee: nextFee,
      applyFeeAndChange: (fee, change) => {
        txBuilder.meshTxBuilderBody.fee = fee.toString();
        setLovelaceQuantity(changeOutput.amount, change);
      },
      recalculateFee: () => calculateCurrentFee(txBuilder)
    });
  }

  txBuilder.meshTxBuilderBody.fee = nextFee.toString();

  if (typeof txBuilder.completeUnbalancedSync === "function") {
    return txBuilder.completeUnbalancedSync();
  }

  throw new Error(
    "Mesh transaction builder is missing completeUnbalancedSync(), so the manually overridden transaction could not be serialized."
  );
}
