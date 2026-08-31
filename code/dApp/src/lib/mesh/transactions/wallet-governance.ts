import { type RuntimeTxBuilder, assertRecordPayload, buildGovernanceScriptSource, buildReferenceScriptDiagnostics, buildTransactionWithReestimatedLimits, createMeshRedeemer, createStateForwarding, createTxPreview, describeReferenceScriptUsage, fetchChangeAddressReferenceUtxos, mergeAssetsByUnit, redeemStateForwardingInput, resolveReferenceScript, resolveStateForwardingInput, resolveStateForwardingReference, sendStateForwardingOutput, setupTransaction, validateForwardedStateDatum } from "./internals";
import { formatGovernancePreview } from "./preview-copy";
import { buildOperatorPathData, buildSttSpendRedeemerData, resolveOperatorOnChainAction } from "@/lib/contracts/action-data";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { getWalletVoteScript, getWalletPublishScript } from "@/lib/contracts/blueprint";
import { type Asset, type BuildResult, type ConstrData, type ContractConfig, type OperatorAuthorityPath, type WalletVoteFormInput, type WalletPublishFormInput } from "@/lib/types/contracts";
import { type Certificate, type VoteType } from "@meshsdk/common";
import { type TxFetcher, type WalletSource } from "@/lib/mesh/tx-context";

async function buildWalletGovernanceTx(
  wallet: WalletSource,
  config: ContractConfig,
  input: {
    action: "wallet-publish" | "wallet-vote";
    authorityPath?: OperatorAuthorityPath;
    payload: Record<string, unknown>;
    sttInputTxHash: string;
    sttInputOutputIndex?: number;
    sttOutputDatum: ConstrData;
    sttOutputAssets: Asset[];
  },
  txFetcher?: TxFetcher
): Promise<BuildResult> {
  const onChainAction = resolveOperatorOnChainAction(input.authorityPath);
  const stateForwarding = createStateForwarding(config);
  const sttParams = stateForwarding.params;
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
      : getWalletVoteScript({
          sttPolicyId: sttParams.sttPolicyId,
          sttAssetNameHex: sttParams.sttAssetNameHex
        });
  const actionLabel = input.action === "wallet-publish" ? "publish" : "vote";
  const prepared = await buildTransactionWithReestimatedLimits(
    `${input.action}:tx.draft-build`,
    `${input.action}:tx.build`,
    async (overrides) => {
      const { tx, fetcher, changeAddress, setupDiagnostics, walletUtxos } =
        await setupTransaction(wallet, undefined, txFetcher);
      const spendValidatorsByRef = new Map<string, string>();
      const changeAddressUtxos = await fetchChangeAddressReferenceUtxos(
        fetcher,
        changeAddress,
        `${input.action}:fetchChangeAddressUtxos`,
        {
          ...setupDiagnostics,
          sttAddress: stateForwarding.address,
          action: input.action
        }
      );
      const stateInput = await resolveStateForwardingInput(
        stateForwarding,
        fetcher,
        {
          txHash: input.sttInputTxHash,
          outputIndex: input.sttInputOutputIndex,
          stage: `${input.action}:fetchSttUtxos`,
          details: setupDiagnostics
        }
      );
      const forwardedAssets = mergeAssetsByUnit(
        input.sttOutputAssets,
        stateInput.input.output.amount
      );
      const resolvedState = await resolveStateForwardingReference(
        stateInput,
        fetcher,
        {
          stage: `${input.action}:resolveSharedSttReferenceScript`,
          details: { ...setupDiagnostics, action: input.action }
        }
      );
      const governanceReferenceScript = await resolveReferenceScript(fetcher, {
        label: actionLabel === "publish" ? "Wallet publish" : "Wallet vote",
        configuredReference:
          input.action === "wallet-publish"
            ? config.walletPublishReference
            : config.walletVoteReference,
        script: governanceScript,
        stage: `${input.action}:resolveGovernanceReferenceScript`,
        details: { ...setupDiagnostics, action: input.action },
        candidateSets: [
          { source: "wallet-utxos", utxos: walletUtxos },
          { source: "wallet-change-address", utxos: changeAddressUtxos }
        ]
      });
      const scriptWitnessDiagnostics = buildReferenceScriptDiagnostics([
        resolvedState.witness,
        {
          label: actionLabel === "publish" ? "Wallet publish" : "Wallet vote",
          script: governanceScript,
          reference: governanceReferenceScript
        }
      ]);
      redeemStateForwardingInput({
        tx,
        resolved: resolvedState,
        redeemer: buildSttSpendRedeemerData(onChainAction),
        budget: overrides?.spendBudgetsByRef.get(resolvedState.inputRef),
        spendValidatorsByRef
      });
      sendStateForwardingOutput({
        tx,
        resolved: resolvedState,
        assets: forwardedAssets,
        datum: forwardedDatum
      });

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
        txBuilder.meshTxBuilderBody.votes = [
          ...(txBuilder.meshTxBuilderBody.votes ?? []),
          {
            type: "ScriptVote",
            vote: input.payload as VoteType,
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
          sttAddress: stateForwarding.address,
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
    },
    txFetcher
  );
  const referenceScriptUsage =
    typeof prepared.context?.referenceScriptUsage === "string"
      ? prepared.context.referenceScriptUsage
      : "";

  return {
    txHex: prepared.txHex,
    preview: createTxPreview(
      input.action,
      formatGovernancePreview(actionLabel, referenceScriptUsage),
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits
  };
}


export async function buildWalletPublishTx(
  wallet: WalletSource,
  config: ContractConfig,
  input: WalletPublishFormInput,
  txFetcher?: TxFetcher
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
  }, txFetcher);
}


export async function buildWalletVoteTx(
  wallet: WalletSource,
  config: ContractConfig,
  input: WalletVoteFormInput,
  txFetcher?: TxFetcher
): Promise<BuildResult> {
  assertRecordPayload(input.vote, "Vote JSON");

  return buildWalletGovernanceTx(wallet, config, {
    action: "wallet-vote",
    authorityPath: input.authorityPath,
    payload: input.vote,
    sttInputTxHash: input.sttInputTxHash,
    sttInputOutputIndex: input.sttInputOutputIndex,
    sttOutputDatum: input.sttOutputDatum,
    sttOutputAssets: input.sttOutputAssets
  }, txFetcher);
}
