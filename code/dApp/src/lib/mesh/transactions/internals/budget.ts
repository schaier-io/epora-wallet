// Orchestrator for the draft→re-estimate→override→hash-refresh build loop. The
// pieces it composes live in sibling modules, split by concern:
//   - budget-runtime-builder.ts — the undocumented Mesh SDK builder shim + types
//   - budget-overrides.ts        — applying manual redeemer budgets + fee↔change
//   - execution-snapshot.ts      — reading execution units back off the builder
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
import { extractExecutionSnapshot } from "./execution-snapshot";
import { refreshScriptDataHashWithLiveCostModels } from "./script-data";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";

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
