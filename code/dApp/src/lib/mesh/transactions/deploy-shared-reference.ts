import { buildTransactionWithReestimatedLimits, createEmptyExecutionValidatorLabels, createTxPreview, getLovelaceQuantity, inspectSharedSttReferenceStore, sendReferenceScriptOnlyOutput, setupTransaction } from "./internals";
import { formatSharedReferenceDeployment } from "./preview-copy";
import { getSttSpendScript, resolveSttReferenceStoreAddress } from "@/lib/contracts/blueprint";
import { type BuildResult } from "@/lib/types/contracts";
import { resolveScriptHash } from "@meshsdk/core";
import { type TxFetcher, type WalletSource } from "@/lib/mesh/tx-context";

export async function buildDeploySharedSttReferenceTx(
  wallet: WalletSource,
  options?: {
    lockedLovelace?: string;
    useExactLovelace?: boolean;
    allowDuplicateCurrentScriptReferences?: boolean;
  },
  txFetcher?: TxFetcher
): Promise<BuildResult> {
  const sttScript = getSttSpendScript();
  const sttScriptHash = resolveScriptHash(sttScript.code, sttScript.version);
  const requestedLovelace = options?.lockedLovelace?.trim() || "5000000";
  const useExactLovelace = options?.useExactLovelace ?? false;
  const allowDuplicateCurrentScriptReferences =
    options?.allowDuplicateCurrentScriptReferences ?? false;

  if (!/^\d+$/.test(requestedLovelace)) {
    throw new Error(
      "Shared STT reference lovelace must be a non-negative integer string."
    );
  }

  const prepared = await buildTransactionWithReestimatedLimits(
    "stt-reference-store:tx.draft-build",
    "stt-reference-store:tx.build",
    async () => {
      const { tx, fetcher, setupDiagnostics } = await setupTransaction(wallet, undefined, txFetcher);
      const inspection = await inspectSharedSttReferenceStore(fetcher, {
        script: sttScript,
        stage: "stt-reference-store:inspect",
        details: setupDiagnostics
      });

      if (inspection.matchingReferences.length > 0) {
        if (!allowDuplicateCurrentScriptReferences) {
          throw new Error(
            inspection.matchingReferences.length === 1
              ? `Shared STT reference is already deployed at ${inspection.matchingReferences[0]!.reference}.`
              : `Shared STT reference store ${inspection.storeAddress} already contains ${inspection.matchingReferences.length} matching current-script reference UTxOs.`
          );
        }
      }

      const deployedOutput = sendReferenceScriptOnlyOutput(
        tx,
        inspection.storeAddress,
        sttScript,
        [{ unit: "lovelace", quantity: requestedLovelace }],
        {
          skipMinimumLovelaceAdjustment: useExactLovelace
        }
      );
      const appliedLockedLovelace = getLovelaceQuantity(deployedOutput.amount).toString();

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          sttScriptHash,
          storeAddress: inspection.storeAddress,
          requestedLovelace,
          appliedLockedLovelace,
          useExactLovelace,
          allowDuplicateCurrentScriptReferences,
          existingMatchingReferenceCount: inspection.matchingReferences.length,
          staleReferenceCount: inspection.staleReferenceCount,
          storeUtxoCount: inspection.storeUtxoCount
        },
        executionLabels: createEmptyExecutionValidatorLabels(),
        context: {
          appliedLockedLovelace,
          requestedLovelace,
          useExactLovelace,
          allowDuplicateCurrentScriptReferences,
          existingMatchingReferenceCount: inspection.matchingReferences.length
        }
      };
    },
    txFetcher
  );

  const appliedLockedLovelace =
    typeof prepared.context?.appliedLockedLovelace === "string"
      ? prepared.context.appliedLockedLovelace
      : requestedLovelace;
  const requestedAmount =
    typeof prepared.context?.requestedLovelace === "string"
      ? prepared.context.requestedLovelace
      : requestedLovelace;
  const exactAmount =
    typeof prepared.context?.useExactLovelace === "boolean"
      ? prepared.context.useExactLovelace
      : useExactLovelace;
  const duplicateMode =
    typeof prepared.context?.allowDuplicateCurrentScriptReferences === "boolean"
      ? prepared.context.allowDuplicateCurrentScriptReferences
      : allowDuplicateCurrentScriptReferences;
  const existingMatchingReferenceCount =
    typeof prepared.context?.existingMatchingReferenceCount === "number"
      ? prepared.context.existingMatchingReferenceCount
      : 0;

  return {
    txHex: prepared.txHex,
    preview: createTxPreview(
      "setup-stt-reference",
      formatSharedReferenceDeployment({
        address: resolveSttReferenceStoreAddress(),
        exactAmount,
        appliedLovelace: appliedLockedLovelace,
        requestedLovelace: requestedAmount,
        duplicateMode,
        existingReferenceCount: existingMatchingReferenceCount
      }),
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits
  };
}
