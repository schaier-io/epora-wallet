import { withStage } from "./errors";
import { refreshScriptDataHashWithLiveCostModels } from "./script-data";
import { createInputRefKey } from "./utxo";
import { getLovelaceQuantity, setLovelaceQuantity } from "./value";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { type Asset, type ExecutionRedeemerUsage, type ExecutionUnitsSummary, type ExecutionValidatorUsage } from "@/lib/types/contracts";
import { type Budget, type Protocol } from "@meshsdk/common";
import { type Transaction, type UTxO } from "@meshsdk/core";

type PreparedTransaction = {
  tx: Transaction;
  diagnostics: Record<string, unknown>;
  context?: Record<string, unknown>;
  executionLabels?: ExecutionValidatorLabels;
};



type RedeemerBudgetOverrides = {
  mintBudgets: Budget[];
  rewardBudgets: Budget[];
  spendBudgetsByRef: Map<string, Budget>;
};



type ExecutionValidatorLabels = {
  mintValidators: string[];
  rewardValidators: string[];
  spendValidatorsByRef: Map<string, string>;
};



type ExecutionSnapshot = {
  overrides: RedeemerBudgetOverrides;
  summary: ExecutionUnitsSummary;
};



export type RuntimeTxBuilder = Transaction["txBuilder"] & {
  selectUtxosFrom?: (inputs: UTxO[]) => unknown;
  txIn?: (
    txHash: string,
    txIndex: number,
    amount: Asset[],
    address: string,
    scriptSize?: number
  ) => RuntimeTxBuilder;
  txInCollateral?: (
    txHash: string,
    txIndex: number,
    amount?: Asset[],
    address?: string
  ) => RuntimeTxBuilder;
  setTotalCollateral?: (collateral: string) => RuntimeTxBuilder;
  setCollateralReturnAddress?: (address: string) => RuntimeTxBuilder;
  meshTxBuilderBody: {
    inputs?: Array<{
      type: string;
      txIn?: { txHash?: string; txIndex?: number };
      scriptTxIn?: {
        redeemer?: { exUnits?: Budget };
      };
    }>;
    mints?: Array<{
      type: string;
      policyId?: string;
      assetName?: string;
      redeemer?: { exUnits?: Budget };
    }>;
    withdrawals?: Array<{
      type: string;
      address?: string;
      redeemer?: { exUnits?: Budget };
    }>;
    outputs?: Array<{
      address?: string;
      amount: Asset[];
      datum?: unknown;
    }>;
    fee?: string;
    changeAddress?: string;
  };
  _protocolParams?: Protocol;
  calculateFee?: () => bigint;
  completeUnbalancedSync?: () => string;
  getActualFee?: () => bigint;
  protocolParams?: (params: Partial<Protocol>) => RuntimeTxBuilder;
};



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



function getPreparedOutputCount(tx: Transaction) {
  const txBuilder = tx.txBuilder as RuntimeTxBuilder;
  return txBuilder.meshTxBuilderBody.outputs?.length ?? 0;
}



function cloneBudget(budget: Budget): Budget {
  return {
    mem: budget.mem,
    steps: budget.steps
  };
}



function applyBudgetOverridesToBuilder(
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



function findAdjustableChangeOutputIndex(
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



function calculateCurrentFee(txBuilder: RuntimeTxBuilder) {
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

function applyManualBudgetOverrides(
  tx: Transaction,
  overrides: RedeemerBudgetOverrides,
  preparedOutputCount: number
) {
  const txBuilder = tx.txBuilder as RuntimeTxBuilder;
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



export function createEmptyExecutionValidatorLabels(): ExecutionValidatorLabels {
  return {
    mintValidators: [],
    rewardValidators: [],
    spendValidatorsByRef: new Map<string, string>()
  };
}



function summarizeUsageByValidator(
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



function extractExecutionSnapshot(
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



export async function buildTransactionWithReestimatedLimits(
  draftStage: string,
  finalStage: string,
  prepareTx: (overrides?: RedeemerBudgetOverrides) => Promise<PreparedTransaction>,
  finalizeOverrides?: (
    overrides: RedeemerBudgetOverrides
  ) => RedeemerBudgetOverrides | undefined
) {
  const draftPrepared = await prepareTx();
  await withStage(draftStage, async () => draftPrepared.tx.build(), draftPrepared.diagnostics);
  const draftExecution = extractExecutionSnapshot(
    draftPrepared.tx,
    draftPrepared.executionLabels
  );

  const finalPrepared = await prepareTx(draftExecution.overrides);
  const preparedOutputCount = getPreparedOutputCount(finalPrepared.tx);
  await withStage(finalStage, async () => finalPrepared.tx.build(), {
    ...finalPrepared.diagnostics,
    draftExecutionUnits: draftExecution.summary
  });
  const estimatedFinalExecution = extractExecutionSnapshot(
    finalPrepared.tx,
    finalPrepared.executionLabels
  );
  const appliedOverrides =
    finalizeOverrides?.(estimatedFinalExecution.overrides) ??
    estimatedFinalExecution.overrides;
  const txHexWithDefaultScriptDataHash = await withStage(
    `${finalStage}:apply-budget-overrides`,
    async () =>
      applyManualBudgetOverrides(
        finalPrepared.tx,
        appliedOverrides,
        preparedOutputCount
      ),
    {
      ...finalPrepared.diagnostics,
      draftExecutionUnits: draftExecution.summary,
      estimatedExecutionUnits: estimatedFinalExecution.summary
    }
  );
  const scriptDataHashRefresh = await withStage(
    `${finalStage}:refresh-script-data-hash`,
    async () =>
      refreshScriptDataHashWithLiveCostModels(
        txHexWithDefaultScriptDataHash,
        new ServerFetcher()
      ),
    {
      ...finalPrepared.diagnostics,
      draftExecutionUnits: draftExecution.summary,
      estimatedExecutionUnits: estimatedFinalExecution.summary
    }
  );
  const txHex = scriptDataHashRefresh.txHex;
  const finalExecution = extractExecutionSnapshot(
    finalPrepared.tx,
    finalPrepared.executionLabels
  );

  const refreshedContext: Record<string, unknown> = {
    ...finalPrepared.context,
    scriptDataHash: {
      before: scriptDataHashRefresh.beforeHash,
      after: scriptDataHashRefresh.afterHash,
      changed: scriptDataHashRefresh.changed,
      source: "blockfrost-live-cost-models"
    }
  };

  return {
    txHex,
    estimatedFeeLovelace: calculateCurrentFee(finalPrepared.tx.txBuilder as RuntimeTxBuilder).toString(),
    executionUnits: finalExecution.summary,
    context: refreshedContext
  };
}


