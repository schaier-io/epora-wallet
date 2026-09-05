// Orchestrator for the draft→re-estimate→override→hash-refresh build loop. The
// pieces it composes live in sibling modules, split by concern:
//   - budget-runtime-builder.ts: the undocumented Mesh SDK builder shim + types
//   - budget-overrides.ts:        applying manual redeemer budgets + fee↔change
//   - execution-snapshot.ts:      reading execution units back off the builder
import {
  applyManualBudgetOverrides,
  calculateCurrentFee,
  getPreparedOutputCount
} from "./budget-overrides";
import {
  type PreparedTransaction,
  type RedeemerBudgetOverrides,
  type RuntimeTxBuilder
} from "./budget-runtime-builder";
import { withStage } from "./errors";
import {
  assertExecutionUnitsWithinTransactionLimits,
  extractExecutionSnapshot
} from "./execution-snapshot";
import {
  buildTxSizeSummary,
  refreshScriptDataHashWithLiveCostModels
} from "./script-data";
import {
  MAX_GOVERNANCE_TRANSACTION_REDEEMERS,
  MAX_TRANSACTION_INPUTS,
  MAX_TRANSACTION_OUTPUTS,
  MAX_TRANSACTION_REDEEMERS,
  MAX_TRANSACTION_SIGNATORIES
} from "@/lib/contracts/transaction-limits";
import { deserializeTx } from "@/lib/mesh/cst";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { type TxFetcher } from "@/lib/mesh/tx-context";

export function assertTransactionShapeIsBounded(shape: {
  inputs: number;
  outputs: number;
  signatories: number;
  redeemers: number;
  hasGovernancePurpose: boolean;
}) {
  const maximumRedeemers = shape.hasGovernancePurpose
    ? MAX_GOVERNANCE_TRANSACTION_REDEEMERS
    : MAX_TRANSACTION_REDEEMERS;
  const limits: ReadonlyArray<readonly [string, number, number]> = [
    ["inputs", shape.inputs, MAX_TRANSACTION_INPUTS],
    ["outputs", shape.outputs, MAX_TRANSACTION_OUTPUTS],
    ["signatories", shape.signatories, MAX_TRANSACTION_SIGNATORIES],
    ["redeemers", shape.redeemers, maximumRedeemers]
  ];

  for (const [label, count, maximum] of limits) {
    if (count > maximum) {
      throw new Error(
        `Transaction has ${count} ${label}; the on-chain limit is ${maximum}.`
      );
    }
  }
}

function collectionSize(value: unknown, label: string) {
  if (Array.isArray(value)) {
    return value.length;
  }
  const candidate = value as { size?: () => number };
  if (typeof candidate?.size === "function") {
    const size = candidate.size();
    if (Number.isSafeInteger(size) && size >= 0) {
      return size;
    }
  }
  throw new Error(`Cannot read the serialized transaction's ${label} count.`);
}

export function readTransactionShape(txHex: string) {
  const transaction = deserializeTx(txHex);
  const body = transaction.body();
  const requiredSigners = body.requiredSigners();
  const certificates = body.certs();
  const withdrawals = body.withdrawals();

  return {
    inputs: collectionSize(body.inputs(), "input"),
    outputs: collectionSize(body.outputs(), "output"),
    signatories: requiredSigners
      ? collectionSize(requiredSigners, "signatory")
      : 0,
    redeemers: transaction.witnessSet().redeemers()?.size() ?? 0,
    hasGovernancePurpose:
      (certificates?.values().length ?? 0) > 0 ||
      (withdrawals?.size ?? 0) > 0 ||
      body.votingProcedures() !== undefined
  };
}

export function assertSerializedTransactionShapeIsBounded(txHex: string) {
  assertTransactionShapeIsBounded(readTransactionShape(txHex));
}

export function assertSerializedTransactionSizeIsBounded(txHex: string) {
  const { usedBytes, maxBytes } = buildTxSizeSummary(txHex);
  if (usedBytes > maxBytes) {
    throw new Error(
      `Serialized transaction uses ${usedBytes} bytes. The protocol limit is ${maxBytes}.`
    );
  }
}

export function assertSerializedTransactionIsBounded(txHex: string) {
  assertSerializedTransactionShapeIsBounded(txHex);
  assertSerializedTransactionSizeIsBounded(txHex);
}

export async function buildTransactionWithReestimatedLimits(
  draftStage: string,
  finalStage: string,
  prepareTx: (overrides?: RedeemerBudgetOverrides) => Promise<PreparedTransaction>,
  // Same injection as setupTransaction: the browser default is unchanged, and a
  // server build can pass a provider that does not go through /api/mesh.
  fetcher: TxFetcher = new ServerFetcher(),
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
        preparedOutputCount,
        finalPrepared.resolveAdjustableLovelaceOutput?.()
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
        fetcher
      ),
    {
      ...finalPrepared.diagnostics,
      draftExecutionUnits: draftExecution.summary,
      estimatedExecutionUnits: estimatedFinalExecution.summary
    }
  );
  const txHex = scriptDataHashRefresh.txHex;
  await withStage(
    `${finalStage}:validate-transaction-bounds`,
    async () => assertSerializedTransactionIsBounded(txHex),
    {
      ...finalPrepared.diagnostics,
      draftExecutionUnits: draftExecution.summary,
      estimatedExecutionUnits: estimatedFinalExecution.summary
    }
  );
  const finalExecution = extractExecutionSnapshot(
    finalPrepared.tx,
    finalPrepared.executionLabels
  );
  await withStage(
    `${finalStage}:validate-execution-units`,
    async () =>
      assertExecutionUnitsWithinTransactionLimits(finalExecution.summary),
    {
      ...finalPrepared.diagnostics,
      draftExecutionUnits: draftExecution.summary,
      finalExecutionUnits: finalExecution.summary
    }
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
    // The required signer `setupTransaction` pinned on the builder; surfaced so
    // the review panel shows the signer the built tx actually needs.
    signerAddress: (finalPrepared.tx.txBuilder as RuntimeTxBuilder).meshTxBuilderBody.changeAddress,
    context: refreshedContext
  };
}
