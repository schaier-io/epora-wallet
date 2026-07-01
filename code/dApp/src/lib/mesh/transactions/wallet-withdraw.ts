import { type RuntimeTxBuilder, STT_SPEND_VALIDATOR, WALLET_WITHDRAW_VALIDATOR, applyWithdrawalWitness, buildReferenceScriptDiagnostics, buildTransactionWithReestimatedLimits, createInputRefKey, createTxPreview, describeReferenceScriptUsage, fetchChangeAddressReferenceUtxos, findUtxo, mergeAssetsByUnit, redeemValueWithRequiredReferenceScript, resolveReferenceScript, resolveSharedSttReferenceScript, resolveSttScriptParams, sendAssetsWithOptionalInlineDatumAndReferenceScript, setupTransaction, validateForwardedStateDatum, withStage } from "./internals";
import { buildOperatorPathData, buildSttSpendRedeemerData, resolveOperatorOnChainAction } from "@/lib/contracts/action-data";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { getSttSpendScript, getWalletWithdrawScript, resolveScriptAddress } from "@/lib/contracts/blueprint";
import { type BuildResult, type ContractConfig, type WalletWithdrawFormInput } from "@/lib/types/contracts";
import { type BrowserWallet } from "@meshsdk/core";

export async function buildWalletWithdrawTx(
  wallet: BrowserWallet,
  config: ContractConfig,
  input: WalletWithdrawFormInput
): Promise<BuildResult> {
  const onChainAction = resolveOperatorOnChainAction(input.authorityPath);
  const sttParams = resolveSttScriptParams(config);

  const sttScript = getSttSpendScript();
  const sttAddress = resolveScriptAddress(sttScript);
  const forwardedDatum = unwrapStateDatum(input.sttOutputDatum, "STT state datum");
  validateForwardedStateDatum(
    forwardedDatum,
    onChainAction,
    "wallet-withdraw:validateStateDatum",
    "Forwarded STT state datum is invalid."
  );

  const walletWithdrawScript = getWalletWithdrawScript({
    sttPolicyId: sttParams.sttPolicyId,
    sttAssetNameHex: sttParams.sttAssetNameHex
  });
  const prepared = await buildTransactionWithReestimatedLimits(
    "wallet-withdraw:tx.draft-build",
    "wallet-withdraw:tx.build",
    async (overrides) => {
      const { tx, fetcher, changeAddress, setupDiagnostics, walletUtxos } =
        await setupTransaction(wallet);
      const spendValidatorsByRef = new Map<string, string>();
      const changeAddressUtxos = await fetchChangeAddressReferenceUtxos(
        fetcher,
        changeAddress,
        "wallet-withdraw:fetchChangeAddressUtxos",
        { ...setupDiagnostics, sttAddress, rewardAddress: input.rewardAddress }
      );
      const sttUtxos = await withStage(
        "wallet-withdraw:fetchSttUtxos",
        async () => fetcher.fetchAddressUTxOs(sttAddress),
        { ...setupDiagnostics, sttAddress }
      );
      const sttInput = findUtxo(
        sttUtxos,
        input.sttInputTxHash,
        input.sttInputOutputIndex
      );
      const forwardedAssets = mergeAssetsByUnit(input.sttOutputAssets, sttInput.output.amount);
      const sttReferenceScript = await resolveSharedSttReferenceScript(fetcher, {
        configuredReference: config.sttSpendReference,
        script: sttScript,
        stage: "wallet-withdraw:resolveSharedSttReferenceScript",
        details: { ...setupDiagnostics, sttAddress },
        excludedRefs: [createInputRefKey(sttInput.input.txHash, sttInput.input.outputIndex)]
      });
      const walletWithdrawReference = await resolveReferenceScript(fetcher, {
        label: "Wallet withdraw",
        configuredReference: config.walletWithdrawReference,
        script: walletWithdrawScript,
        stage: "wallet-withdraw:resolveWalletReferenceScript",
        details: { ...setupDiagnostics, rewardAddress: input.rewardAddress },
        candidateSets: [
          { source: "wallet-utxos", utxos: walletUtxos },
          { source: "wallet-change-address", utxos: changeAddressUtxos }
        ]
      });
      const scriptWitnessDiagnostics = buildReferenceScriptDiagnostics([
        {
          label: "STT",
          script: sttScript,
          reference: sttReferenceScript
        },
        {
          label: "Wallet withdraw",
          script: walletWithdrawScript,
          reference: walletWithdrawReference
        }
      ]);
      spendValidatorsByRef.set(
        createInputRefKey(sttInput.input.txHash, sttInput.input.outputIndex),
        STT_SPEND_VALIDATOR
      );

      redeemValueWithRequiredReferenceScript(tx, sttInput, sttReferenceScript, {
        data: buildSttSpendRedeemerData(onChainAction),
        budget: overrides?.spendBudgetsByRef.get(
          createInputRefKey(sttInput.input.txHash, sttInput.input.outputIndex)
        )
      });

      sendAssetsWithOptionalInlineDatumAndReferenceScript(
        tx,
        sttAddress,
        forwardedAssets,
        forwardedDatum
      );

      tx.withdrawRewards(input.rewardAddress, input.amountLovelace);
      applyWithdrawalWitness(
        tx.txBuilder as RuntimeTxBuilder,
        walletWithdrawScript,
        walletWithdrawReference,
        buildOperatorPathData(input.authorityPath),
        overrides?.rewardBudgets[0]
      );

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          sttAddress,
          rewardAddress: input.rewardAddress,
          amountLovelace: input.amountLovelace,
          scriptWitnessDiagnostics
        },
        executionLabels: {
          mintValidators: [],
          rewardValidators: [WALLET_WITHDRAW_VALIDATOR],
          spendValidatorsByRef
        },
        context: {
          referenceScriptUsage: describeReferenceScriptUsage(scriptWitnessDiagnostics)
        }
      };
    }
  );
  const referenceScriptUsage =
    typeof prepared.context?.referenceScriptUsage === "string"
      ? prepared.context.referenceScriptUsage
      : "";

  return {
    txHex: prepared.txHex,
    preview: createTxPreview(
      "wallet-withdraw",
      `Withdraw ${input.amountLovelace} lovelace from ${input.rewardAddress}${referenceScriptUsage}`,
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits
  };
}

