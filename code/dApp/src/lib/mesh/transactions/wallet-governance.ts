import { type RuntimeTxBuilder, STT_SPEND_VALIDATOR, assertRecordPayload, buildGovernanceScriptSource, buildReferenceScriptDiagnostics, buildTransactionWithReestimatedLimits, createInputRefKey, createMeshRedeemer, createTxPreview, describeReferenceScriptUsage, fetchChangeAddressReferenceUtxos, findUtxo, mergeAssetsByUnit, redeemValueWithRequiredReferenceScript, resolveReferenceScript, resolveSharedSttReferenceScript, resolveSttScriptParams, sendAssetsWithOptionalInlineDatumAndReferenceScript, setupTransaction, validateForwardedStateDatum, withStage } from "./internals";
import { buildOperatorPathData, buildSttSpendRedeemerData, resolveOperatorOnChainAction } from "@/lib/contracts/action-data";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { getSttSpendScript, getWalletProposeScript, getWalletPublishScript, resolveScriptAddress } from "@/lib/contracts/blueprint";
import { type Asset, type BuildResult, type ConstrData, type ContractConfig, type OperatorAuthorityPath, type WalletProposeFormInput, type WalletPublishFormInput } from "@/lib/types/contracts";
import { type Certificate, type Proposal } from "@meshsdk/common";
import { type BrowserWallet } from "@meshsdk/core";

async function buildWalletGovernanceTx(
  wallet: BrowserWallet,
  config: ContractConfig,
  input: {
    action: "wallet-publish" | "wallet-propose";
    authorityPath?: OperatorAuthorityPath;
    payload: Record<string, unknown>;
    sttInputTxHash: string;
    sttInputOutputIndex?: number;
    sttOutputDatum: ConstrData;
    sttOutputAssets: Asset[];
  }
): Promise<BuildResult> {
  const onChainAction = resolveOperatorOnChainAction(input.authorityPath);
  const sttParams = resolveSttScriptParams(config);

  const sttScript = getSttSpendScript();
  const sttAddress = resolveScriptAddress(sttScript);
  const forwardedDatum = unwrapStateDatum(input.sttOutputDatum, "STT state datum");
  validateForwardedStateDatum(
    forwardedDatum,
    onChainAction,
    `${input.action}:validateStateDatum`,
    "Forwarded STT state datum is invalid."
  );

  const governanceScript =
    input.action === "wallet-publish"
      ? getWalletPublishScript({
          sttPolicyId: sttParams.sttPolicyId,
          sttAssetNameHex: sttParams.sttAssetNameHex
        })
      : getWalletProposeScript({
          sttPolicyId: sttParams.sttPolicyId,
          sttAssetNameHex: sttParams.sttAssetNameHex
        });
  const actionLabel = input.action === "wallet-publish" ? "publish" : "propose";
  const prepared = await buildTransactionWithReestimatedLimits(
    `${input.action}:tx.draft-build`,
    `${input.action}:tx.build`,
    async (overrides) => {
      const { tx, fetcher, changeAddress, setupDiagnostics, walletUtxos } =
        await setupTransaction(wallet);
      const spendValidatorsByRef = new Map<string, string>();
      const changeAddressUtxos = await fetchChangeAddressReferenceUtxos(
        fetcher,
        changeAddress,
        `${input.action}:fetchChangeAddressUtxos`,
        { ...setupDiagnostics, sttAddress, action: input.action }
      );
      const sttUtxos = await withStage(
        `${input.action}:fetchSttUtxos`,
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
        stage: `${input.action}:resolveSharedSttReferenceScript`,
        details: { ...setupDiagnostics, sttAddress, action: input.action },
        excludedRefs: [createInputRefKey(sttInput.input.txHash, sttInput.input.outputIndex)]
      });
      const governanceReferenceScript = await resolveReferenceScript(fetcher, {
        label: actionLabel === "publish" ? "Wallet publish" : "Wallet propose",
        configuredReference:
          input.action === "wallet-publish"
            ? config.walletPublishReference
            : config.walletProposeReference,
        script: governanceScript,
        stage: `${input.action}:resolveGovernanceReferenceScript`,
        details: { ...setupDiagnostics, action: input.action },
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
          label: actionLabel === "publish" ? "Wallet publish" : "Wallet propose",
          script: governanceScript,
          reference: governanceReferenceScript
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

      const txBuilder = tx.txBuilder as RuntimeTxBuilder;
      if (input.action === "wallet-publish") {
        txBuilder.meshTxBuilderBody.certificates = [
          ...(txBuilder.meshTxBuilderBody.certificates ?? []),
          {
            type: "ScriptCertificate",
            certType: input.payload as Certificate["certType"],
            scriptSource: buildGovernanceScriptSource(
              governanceScript,
              governanceReferenceScript
            ),
            redeemer: createMeshRedeemer(buildOperatorPathData(input.authorityPath))
          }
        ];
      } else {
        txBuilder.meshTxBuilderBody.proposals = [
          ...(txBuilder.meshTxBuilderBody.proposals ?? []),
          {
            type: "ScriptProposal",
            proposalType: input.payload as Proposal["proposalType"],
            scriptSource: buildGovernanceScriptSource(
              governanceScript,
              governanceReferenceScript
            ),
            redeemer: createMeshRedeemer(buildOperatorPathData(input.authorityPath))
          }
        ];
      }

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          sttAddress,
          action: input.action,
          sttInputTxHash: input.sttInputTxHash,
          sttInputOutputIndex: input.sttInputOutputIndex,
          scriptWitnessDiagnostics
        },
        executionLabels: {
          mintValidators: [],
          rewardValidators: [],
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
      input.action,
      `Forward STT and ${actionLabel} one governance payload${referenceScriptUsage}`,
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits
  };
}


export async function buildWalletPublishTx(
  wallet: BrowserWallet,
  config: ContractConfig,
  input: WalletPublishFormInput
): Promise<BuildResult> {
  assertRecordPayload(input.certificate, "Certificate JSON");

  return buildWalletGovernanceTx(wallet, config, {
    action: "wallet-publish",
    authorityPath: input.authorityPath,
    payload: input.certificate,
    sttInputTxHash: input.sttInputTxHash,
    sttInputOutputIndex: input.sttInputOutputIndex,
    sttOutputDatum: input.sttOutputDatum,
    sttOutputAssets: input.sttOutputAssets
  });
}


export async function buildWalletProposeTx(
  wallet: BrowserWallet,
  config: ContractConfig,
  input: WalletProposeFormInput
): Promise<BuildResult> {
  assertRecordPayload(input.proposal, "Proposal JSON");

  return buildWalletGovernanceTx(wallet, config, {
    action: "wallet-propose",
    authorityPath: input.authorityPath,
    payload: input.proposal,
    sttInputTxHash: input.sttInputTxHash,
    sttInputOutputIndex: input.sttInputOutputIndex,
    sttOutputDatum: input.sttOutputDatum,
    sttOutputAssets: input.sttOutputAssets
  });
}

