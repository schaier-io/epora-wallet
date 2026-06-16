import {
  type ExecutionSnapshot,
  type ExecutionValidatorLabels,
  type RuntimeTxBuilder
} from "./budget-runtime-builder";
import { createInputRefKey } from "./utxo";
import {
  type ExecutionRedeemerUsage,
  type ExecutionValidatorUsage
} from "@/lib/types/contracts";
import { type Budget } from "@meshsdk/common";
import { type Transaction } from "@meshsdk/core";

function budgetToStrings(
  tag: string,
  index: number,
  budget: Budget,
  reference?: string,
  validator?: string
): ExecutionRedeemerUsage {
  return {
    tag,
    index,
    mem: budget.mem.toString(),
    steps: budget.steps.toString(),
    reference,
    validator
  };
}



export function createEmptyExecutionValidatorLabels(): ExecutionValidatorLabels {
  return {
    mintValidators: [],
    rewardValidators: [],
    spendValidatorsByRef: new Map<string, string>()
  };
}



export function summarizeUsageByValidator(
  redeemers: ExecutionRedeemerUsage[]
): ExecutionValidatorUsage[] {
  const totals = new Map<
    string,
    { memUsed: bigint; stepsUsed: bigint; redeemerCount: number }
  >();

  for (const redeemer of redeemers) {
    const validator = redeemer.validator ?? "unknown";
    const existing = totals.get(validator) ?? {
      memUsed: 0n,
      stepsUsed: 0n,
      redeemerCount: 0
    };

    existing.memUsed += BigInt(redeemer.mem);
    existing.stepsUsed += BigInt(redeemer.steps);
    existing.redeemerCount += 1;
    totals.set(validator, existing);
  }

  return [...totals.entries()]
    .sort((left, right) => {
      if (left[1].stepsUsed === right[1].stepsUsed) {
        return left[0].localeCompare(right[0]);
      }

      return left[1].stepsUsed > right[1].stepsUsed ? -1 : 1;
    })
    .map(([validator, usage]) => ({
      validator,
      memUsed: usage.memUsed.toString(),
      stepsUsed: usage.stepsUsed.toString(),
      redeemerCount: usage.redeemerCount
    }));
}



export function extractExecutionSnapshot(
  tx: Transaction,
  executionLabels?: ExecutionValidatorLabels
): ExecutionSnapshot {
  const txBuilder = tx.txBuilder as RuntimeTxBuilder;
  const protocolParams = txBuilder._protocolParams;
  const inputs = txBuilder.meshTxBuilderBody.inputs ?? [];
  const mints = txBuilder.meshTxBuilderBody.mints ?? [];
  const withdrawals = txBuilder.meshTxBuilderBody.withdrawals ?? [];
  const labels = executionLabels ?? createEmptyExecutionValidatorLabels();

  const spendBudgetsByRef = new Map<string, Budget>();
  const mintBudgets: Budget[] = [];
  const rewardBudgets: Budget[] = [];
  const redeemers: ExecutionRedeemerUsage[] = [];
  let totalMem = 0n;
  let totalSteps = 0n;
  let mintBudgetIndex = 0;
  let rewardBudgetIndex = 0;

  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const budget = input.scriptTxIn?.redeemer?.exUnits;
    const txHash = input.txIn?.txHash;
    const txIndex = input.txIn?.txIndex;

    if (input.type !== "Script" || !budget || !txHash || typeof txIndex !== "number") {
      continue;
    }

    const reference = createInputRefKey(txHash, txIndex);
    spendBudgetsByRef.set(reference, budget);
    redeemers.push(
      budgetToStrings(
        "SPEND",
        index,
        budget,
        reference,
        labels.spendValidatorsByRef.get(reference)
      )
    );
    totalMem += BigInt(budget.mem);
    totalSteps += BigInt(budget.steps);
  }

  for (let index = 0; index < mints.length; index += 1) {
    const mint = mints[index];
    const budget = mint.redeemer?.exUnits;

    if (mint.type !== "Plutus" || !budget) {
      continue;
    }

    mintBudgets.push(budget);
    const reference =
      typeof mint.policyId === "string" && typeof mint.assetName === "string"
        ? `${mint.policyId}.${mint.assetName}`
        : undefined;
    redeemers.push(
      budgetToStrings(
        "MINT",
        index,
        budget,
        reference,
        labels.mintValidators[mintBudgetIndex]
      )
    );
    totalMem += BigInt(budget.mem);
    totalSteps += BigInt(budget.steps);
    mintBudgetIndex += 1;
  }

  for (let index = 0; index < withdrawals.length; index += 1) {
    const withdrawal = withdrawals[index];
    const budget = withdrawal.redeemer?.exUnits;

    if (withdrawal.type !== "ScriptWithdrawal" || !budget) {
      continue;
    }

    rewardBudgets.push(budget);
    redeemers.push(
      budgetToStrings(
        "REWARD",
        index,
        budget,
        withdrawal.address,
        labels.rewardValidators[rewardBudgetIndex]
      )
    );
    totalMem += BigInt(budget.mem);
    totalSteps += BigInt(budget.steps);
    rewardBudgetIndex += 1;
  }

  return {
    overrides: {
      mintBudgets,
      rewardBudgets,
      spendBudgetsByRef
    },
    summary: {
      memUsed: totalMem.toString(),
      stepsUsed: totalSteps.toString(),
      maxTxMem: protocolParams?.maxTxExMem?.toString() ?? "0",
      maxTxSteps: protocolParams?.maxTxExSteps?.toString() ?? "0",
      maxBlockMem: protocolParams?.maxBlockExMem?.toString() ?? "0",
      maxBlockSteps: protocolParams?.maxBlockExSteps?.toString() ?? "0",
      redeemers,
      perValidator: summarizeUsageByValidator(redeemers)
    }
  };
}
