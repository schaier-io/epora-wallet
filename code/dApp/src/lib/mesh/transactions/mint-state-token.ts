import { type RuntimeTxBuilder, STT_MINT_VALIDATOR, addWalletInput, applyMintWitness, buildReferenceScriptDiagnostics, buildTransactionWithReestimatedLimits, createStageError, createTxPreview, deriveAssetName, describeReferenceScriptUsage, getLovelaceQuantity, hasReferenceScript, inspectSharedSttReferenceStore, normalizeMintStarterAssets, resolveMintReferenceInput, sendAssetsWithOptionalInlineDatumAndReferenceScript, setupTransaction, summarizeAmountForTxPreview, withStage, withWalletWitness } from "./internals";
import { buildWalletWitnessData } from "@/lib/contracts/action-data";
import { getSttMintScript, resolveScriptAddress, resolveWalletSpendAddress } from "@/lib/contracts/blueprint";
import { readStateSections } from "@/lib/contracts/state-layout";
import { collectStateDatumWarnings, validateMintStateDatum } from "@/lib/contracts/state-validation";
import { decodeWalletNameFromDatum, normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { type BuildResult, type MintFormInput } from "@/lib/types/contracts";
import { type BrowserWallet, resolveScriptHash } from "@meshsdk/core";

export async function buildMintStateTokenTx(
  wallet: BrowserWallet,
  input: MintFormInput
): Promise<BuildResult> {
  const requestedStarterAssets = normalizeMintStarterAssets(
    input.starterAssets,
    input.mintLovelace
  );
  const requestedStarterLovelace = getLovelaceQuantity(requestedStarterAssets).toString();
  const normalizedStateDatum = unwrapStateDatum(input.stateDatum, "Mint state datum");
  const stateValidationErrors = validateMintStateDatum(normalizedStateDatum);
  if (stateValidationErrors.length > 0) {
    throw createStageError(
      "mint:validateStateDatum",
      new Error(stateValidationErrors[0] ?? "Mint state datum is invalid."),
      {
        validationErrors: stateValidationErrors,
        stateDatum: normalizedStateDatum
      }
    );
  }
  // Non-blocking advisories (e.g. a lapsed wake-up timer, or a beneficiary-only
  // recovery time-locked far out). Accepted on-chain; logged here and returned
  // in the BuildResult so the wallet creator sees them in the review panel.
  const mintStateWarnings = collectStateDatumWarnings(normalizedStateDatum);
  for (const warning of mintStateWarnings) {
    console.warn(`[mint:validateStateDatum] ${warning}`);
  }
  const walletName = normalizeWalletName(
    decodeWalletNameFromDatum(readStateSections(normalizedStateDatum).walletName)
  );
  const mintedDatum = withWalletWitness(
    normalizedStateDatum,
    buildWalletWitnessData("mint")
  );

  const sttScript = getSttMintScript();
  const policyId = resolveScriptHash(sttScript.code, sttScript.version);
  const prepared = await buildTransactionWithReestimatedLimits(
    "mint:tx.draft-build",
    "mint:tx.build",
    async (overrides) => {
      const {
        tx,
        fetcher,
        walletUtxos,
        spendableWalletUtxos,
        setupDiagnostics,
        reserveInputRef
      } = await setupTransaction(wallet);
      const mintReferenceInput = await withStage(
        "mint:referenceUtxo",
        async () =>
          resolveMintReferenceInput(
            walletUtxos,
            spendableWalletUtxos,
            input.selectedReferenceUtxo
          ),
        {
          ...setupDiagnostics,
          selectedReferenceUtxo: input.selectedReferenceUtxo ?? null
        }
      );
      const selectedRef = {
        txHash: mintReferenceInput.utxo.input.txHash,
        outputIndex: mintReferenceInput.utxo.input.outputIndex
      };

      reserveInputRef(selectedRef.txHash, selectedRef.outputIndex);
      const assetName = deriveAssetName(selectedRef);
      const scriptAddress = resolveScriptAddress(sttScript);
      const walletAddress = resolveWalletSpendAddress({
        sttPolicyId: policyId,
        sttAssetNameHex: assetName
      });
      const sharedReferenceInspection = await inspectSharedSttReferenceStore(fetcher, {
        script: sttScript,
        stage: "mint:inspectSharedSttReferenceStore",
        details: {
          ...setupDiagnostics,
          policyId,
          assetName,
          selectedReferenceUtxo: selectedRef
        }
      });
      const sttReferenceScript =
        sharedReferenceInspection.matchingReferences[0] ?? null;
      const scriptWitnessDiagnostics = buildReferenceScriptDiagnostics([
        {
          label: "STT mint",
          script: sttScript,
          reference: sttReferenceScript
        }
      ]);
      const txBuilder = tx.txBuilder as RuntimeTxBuilder;

      addWalletInput(txBuilder, mintReferenceInput.utxo);

      applyMintWitness(
        txBuilder,
        policyId,
        assetName,
        sttScript,
        sttReferenceScript,
        overrides?.mintBudgets[0]
      );
      tx.isCollateralNeeded = true;

      const sttOutput = sendAssetsWithOptionalInlineDatumAndReferenceScript(
        tx,
        scriptAddress,
        [
          { unit: `${policyId}${assetName}`, quantity: "1" },
          { unit: "lovelace", quantity: "0" }
        ],
        mintedDatum
      );
      const walletFundingOutput = sendAssetsWithOptionalInlineDatumAndReferenceScript(
        tx,
        walletAddress,
        requestedStarterAssets
      );
      const sttOutputLovelace = getLovelaceQuantity(sttOutput.amount).toString();
      const walletFundingLovelace = getLovelaceQuantity(
        walletFundingOutput.amount
      ).toString();
      const walletFundingSummary = summarizeAmountForTxPreview(walletFundingOutput.amount);

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          policyId,
          assetName,
          selectedReferenceUtxo: selectedRef,
          mintReferenceInput: {
            reference: mintReferenceInput.reference,
            source: mintReferenceInput.source,
            detected: true,
            address: mintReferenceInput.utxo.output.address,
            amount: mintReferenceInput.utxo.output.amount,
            hasReferenceScript: hasReferenceScript(mintReferenceInput.utxo)
          },
          requestedStarterAssets,
          requestedStarterLovelace,
          appliedStarterAssets: walletFundingOutput.amount,
          appliedStarterLovelace: walletFundingLovelace,
          appliedStarterSummary: walletFundingSummary,
          sttOutputLovelace,
          scriptAddress,
          walletAddress,
          scriptWitnessDiagnostics,
          sharedSttReferenceStoreAddress: sharedReferenceInspection.storeAddress,
          sharedSttReferenceDetected:
            sharedReferenceInspection.matchingReferences.length > 0,
          sharedSttReferenceMatchCount:
            sharedReferenceInspection.matchingReferences.length,
          sharedSttReferenceStaleCount: sharedReferenceInspection.staleReferenceCount,
          sharedSttReferenceUsed: sttReferenceScript?.reference ?? null
        },
        executionLabels: {
          mintValidators: [STT_MINT_VALIDATOR],
          rewardValidators: [],
          spendValidatorsByRef: new Map<string, string>()
        },
        context: {
          referenceScriptUsage: describeReferenceScriptUsage(scriptWitnessDiagnostics),
          walletAddress,
          requestedStarterAssets,
          requestedStarterLovelace,
          appliedStarterAssets: walletFundingOutput.amount,
          appliedStarterLovelace: walletFundingLovelace,
          appliedStarterSummary: walletFundingSummary,
          sttOutputLovelace
        }
      };
    }
  );
  const walletAddress =
    typeof prepared.context?.walletAddress === "string"
      ? prepared.context.walletAddress
      : null;
  const appliedStarterLovelace =
    typeof prepared.context?.appliedStarterLovelace === "string"
      ? prepared.context.appliedStarterLovelace
      : requestedStarterLovelace;
  const appliedStarterSummary =
    typeof prepared.context?.appliedStarterSummary === "string"
      ? prepared.context.appliedStarterSummary
      : `${appliedStarterLovelace} lovelace`;

  return {
    txHex: prepared.txHex,
    preview: createTxPreview(
      "mint",
      `Create ${walletName} with 1 STT under policy ${policyId} and fund ${walletAddress ?? "the new wallet address"} with ${appliedStarterSummary}${typeof prepared.context?.referenceScriptUsage === "string" ? prepared.context.referenceScriptUsage : ""}`,
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits,
    warnings: mintStateWarnings.length > 0 ? mintStateWarnings : undefined
  };
}

