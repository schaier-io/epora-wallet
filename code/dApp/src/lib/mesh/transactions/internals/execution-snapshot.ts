import {
  type ExecutionSnapshot,
  type ExecutionValidatorLabels,
  type RuntimeTxBuilder
} from "./budget-runtime-builder";
import { createInputRefKey } from "./utxo";
import {
  type ExecutionRedeemerUsage,
  type ExecutionUnitsSummary,
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



export function assertExecutionUnitsWithinTransactionLimits(
  summary: ExecutionUnitsSummary
) {
  const limits: ReadonlyArray<readonly [string, bigint, bigint]> = [
    ["memory", BigInt(summary.memUsed), BigInt(summary.maxTxMem)],
    ["CPU", BigInt(summary.stepsUsed), BigInt(summary.maxTxSteps)]
  ];

  for (const [label, used, maximum] of limits) {
    if (used > 0n && maximum <= 0n) {
      throw new Error(
        `Cannot verify transaction ${label} use because the protocol limit is missing.`
      );
    }

    if (used > maximum) {
      throw new Error(
        `Transaction uses ${used} ${label} units. The protocol limit is ${maximum}.`
      );
    }
  }
}



export function createEmptyExecutionValidatorLabels(): ExecutionValidatorLabels {
  return {
    certificateValidators: [],
    mintValidators: [],
    rewardValidators: [],
    spendValidatorsByRef: new Map<string, string>(),
    voteValidators: []
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
  const certificates = txBuilder.meshTxBuilderBody.certificates ?? [];
  const votes = txBuilder.meshTxBuilderBody.votes ?? [];
  const labels = executionLabels ?? createEmptyExecutionValidatorLabels();

  const certificateBudgets: Budget[] = [];
  const spendBudgetsByRef = new Map<string, Budget>();
  const mintBudgets: Budget[] = [];
  const rewardBudgets: Budget[] = [];
  const voteBudgets: Budget[] = [];
  const redeemers: ExecutionRedeemerUsage[] = [];
  let totalMem = 0n;
  let totalSteps = 0n;
  let mintBudgetIndex = 0;
  let rewardBudgetIndex = 0;
  let certificateBudgetIndex = 0;
  let voteBudgetIndex = 0;

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

  for (let index = 0; index < certificates.length; index += 1) {
    const certificate = certificates[index];
    if (certificate.type !== "ScriptCertificate") {
      continue;
    }
    const budget = certificate.redeemer?.exUnits;
    if (!budget) {
      continue;
    }

    certificateBudgets.push(budget);
    redeemers.push(
      budgetToStrings(
        "CERT",
        index,
        budget,
        certificate.certType.type,
        labels.certificateValidators?.[certificateBudgetIndex]
      )
    );
    totalMem += BigInt(budget.mem);
    totalSteps += BigInt(budget.steps);
    certificateBudgetIndex += 1;
  }

  for (let index = 0; index < votes.length; index += 1) {
    const vote = votes[index];
    if (vote.type !== "ScriptVote") {
      continue;
    }
    const budget = vote.redeemer?.exUnits;
    if (!budget) {
      continue;
    }

    voteBudgets.push(budget);
    redeemers.push(
      budgetToStrings(
        "VOTE",
        index,
        budget,
        vote.vote.voter.type,
        labels.voteValidators?.[voteBudgetIndex]
      )
    );
    totalMem += BigInt(budget.mem);
    totalSteps += BigInt(budget.steps);
    voteBudgetIndex += 1;
  }

  return {
    overrides: {
      certificateBudgets,
      mintBudgets,
      rewardBudgets,
      spendBudgetsByRef,
      voteBudgets
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
