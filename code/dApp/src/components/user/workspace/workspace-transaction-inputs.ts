import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { beneficiaryPreparationActiveAtom, beneficiaryPreparationPoolAssetsAtom, consolidateSttAssetsAtom, consolidateSttInputHashAtom, consolidateSttInputIndexAtom, consolidateWalletInputsAtom, consolidateWalletOutputsAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import { lockFundsAssetsAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";
import { mintReferenceAtom, mintStarterAssetsAtom, mintStateFormAtom, mintZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { voteJsonAtom, voteSttAssetsAtom, voteSttInputHashAtom, voteSttInputIndexAtom, voteSttStateFormAtom, voteZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/vote-form.atoms";
import { publishCertificateJsonAtom, publishSttAssetsAtom, publishSttInputHashAtom, publishSttInputIndexAtom, publishSttStateFormAtom, publishZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import { consolidateAuthorityPathAtom, beneficiaryStreamStopIdAtom, streamingPaymentPayoutAmountsAtom, sttAuthorityPathAtom, sttExtraTransfersAtom, sttInputOutputIndexAtom, sttInputTxHashAtom, sttOutputAssetsAtom, sttProofOfLifeOverrideModeAtom, sttProofOfLifeSpecificDateTimeAtom, sttStateFormAtom, sttWalletInputsAtom, sttWalletOutputsAtom, updateStateFormAtom, walletOperatorPathAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { withdrawAmountAtom, withdrawSttAssetsAtom, withdrawSttInputHashAtom, withdrawSttInputIndexAtom, withdrawSttStateFormAtom, withdrawZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";
import { effectiveWithdrawRewardAddressAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";
import { withBeneficiarySigningAddressesDerived } from "@/components/user/workspace/helpers/form-state";
import { sttZeroAdminConfirmedAtom } from "./atoms/forms/stt-spend-form.atoms";
import type { UserActionKind } from "@/components/user/flow-types";

// Snapshots every form atom the transaction builders read, in one place, so the
// factory separates "gather the current form inputs" from "build the tx". Read
// at call time, exactly as before, with no behavior change.
export function resolveWorkspaceTransactionInputs(
  jotaiStore: Pick<WorkspaceTransactionsCtx["jotaiStore"], "get">
) {
  return {
    config: jotaiStore.get(configAtom),
    consolidateAuthorityPath: jotaiStore.get(consolidateAuthorityPathAtom),
    consolidateSttAssets: jotaiStore.get(consolidateSttAssetsAtom),
    consolidateSttInputHash: jotaiStore.get(consolidateSttInputHashAtom),
    consolidateSttInputIndex: jotaiStore.get(consolidateSttInputIndexAtom),
    consolidateWalletInputs: jotaiStore.get(consolidateWalletInputsAtom),
    beneficiaryPreparationActive: jotaiStore.get(beneficiaryPreparationActiveAtom),
    beneficiaryPreparationPoolAssets: jotaiStore.get(beneficiaryPreparationPoolAssetsAtom),
    consolidateWalletOutputs: jotaiStore.get(consolidateWalletOutputsAtom),
    lockFundsAssets: jotaiStore.get(lockFundsAssetsAtom),
    mintReference: jotaiStore.get(mintReferenceAtom),
    mintStarterAssets: jotaiStore.get(mintStarterAssetsAtom),
    mintStateForm: jotaiStore.get(mintStateFormAtom),
    voteJson: jotaiStore.get(voteJsonAtom),
    voteSttAssets: jotaiStore.get(voteSttAssetsAtom),
    voteSttInputHash: jotaiStore.get(voteSttInputHashAtom),
    voteSttInputIndex: jotaiStore.get(voteSttInputIndexAtom),
    voteSttStateForm: jotaiStore.get(voteSttStateFormAtom),
    publishCertificateJson: jotaiStore.get(publishCertificateJsonAtom),
    publishSttAssets: jotaiStore.get(publishSttAssetsAtom),
    publishSttInputHash: jotaiStore.get(publishSttInputHashAtom),
    publishSttInputIndex: jotaiStore.get(publishSttInputIndexAtom),
    publishSttStateForm: jotaiStore.get(publishSttStateFormAtom),
    beneficiaryStreamStopId: jotaiStore.get(beneficiaryStreamStopIdAtom),
    streamingPaymentPayoutAmounts: jotaiStore.get(streamingPaymentPayoutAmountsAtom),
    sttAuthorityPath: jotaiStore.get(sttAuthorityPathAtom),
    sttExtraTransfers: jotaiStore.get(sttExtraTransfersAtom),
    sttInputOutputIndex: jotaiStore.get(sttInputOutputIndexAtom),
    sttInputTxHash: jotaiStore.get(sttInputTxHashAtom),
    sttOutputAssets: jotaiStore.get(sttOutputAssetsAtom),
    sttProofOfLifeOverrideMode: jotaiStore.get(sttProofOfLifeOverrideModeAtom),
    sttProofOfLifeSpecificDateTime: jotaiStore.get(sttProofOfLifeSpecificDateTimeAtom),
    sttStateForm: jotaiStore.get(sttStateFormAtom),
    updateStateForm:
      jotaiStore.get(updateStateFormAtom) ??
      withBeneficiarySigningAddressesDerived(jotaiStore.get(sttStateFormAtom)),
    sttWalletInputs: jotaiStore.get(sttWalletInputsAtom),
    sttWalletOutputs: jotaiStore.get(sttWalletOutputsAtom),
    walletOperatorPath: jotaiStore.get(walletOperatorPathAtom),
    withdrawAmount: jotaiStore.get(withdrawAmountAtom),
    withdrawRewardAddress: jotaiStore.get(effectiveWithdrawRewardAddressAtom),
    withdrawSttAssets: jotaiStore.get(withdrawSttAssetsAtom),
    withdrawSttInputHash: jotaiStore.get(withdrawSttInputHashAtom),
    withdrawSttInputIndex: jotaiStore.get(withdrawSttInputIndexAtom),
    withdrawSttStateForm: jotaiStore.get(withdrawSttStateFormAtom)
  };
}

/** Read only the selected action's builder and field-validation inputs. */
export function resolveWorkspaceActionSnapshotInputs(
  { get }: Pick<WorkspaceTransactionsCtx["jotaiStore"], "get">,
  action: UserActionKind
) {
  const config = get(configAtom);
  switch (action) {
    case "mint":
      return { config, mintReference: get(mintReferenceAtom), mintStarterAssets: get(mintStarterAssetsAtom),
        mintStateForm: get(mintStateFormAtom), zeroAdminConfirmed: get(mintZeroAdminConfirmedAtom) };
    case "lock-funds":
      return { config, lockFundsAssets: get(lockFundsAssetsAtom) };
    case "wallet-withdraw":
      return { config, walletOperatorPath: get(walletOperatorPathAtom),
        withdrawAmount: get(withdrawAmountAtom), withdrawRewardAddress: get(effectiveWithdrawRewardAddressAtom),
        withdrawSttInputHash: get(withdrawSttInputHashAtom), withdrawSttInputIndex: get(withdrawSttInputIndexAtom),
        withdrawSttAssets: get(withdrawSttAssetsAtom), withdrawSttStateForm: get(withdrawSttStateFormAtom),
        zeroAdminConfirmed: get(withdrawZeroAdminConfirmedAtom) };
    case "wallet-publish":
      return { config, walletOperatorPath: get(walletOperatorPathAtom),
        publishCertificateJson: get(publishCertificateJsonAtom), publishSttInputHash: get(publishSttInputHashAtom),
        publishSttInputIndex: get(publishSttInputIndexAtom), publishSttAssets: get(publishSttAssetsAtom),
        publishSttStateForm: get(publishSttStateFormAtom), zeroAdminConfirmed: get(publishZeroAdminConfirmedAtom) };
    case "wallet-vote":
      return { config, walletOperatorPath: get(walletOperatorPathAtom), voteJson: get(voteJsonAtom),
        voteSttInputHash: get(voteSttInputHashAtom), voteSttInputIndex: get(voteSttInputIndexAtom),
        voteSttAssets: get(voteSttAssetsAtom), voteSttStateForm: get(voteSttStateFormAtom),
        zeroAdminConfirmed: get(voteZeroAdminConfirmedAtom) };
    case "set-intended-stake-credential":
      return { config, walletOperatorPath: get(walletOperatorPathAtom) };
    case "consolidate-utxo": {
      const inputs = { config, beneficiaryPreparationActive: get(beneficiaryPreparationActiveAtom),
        consolidateSttInputHash: get(consolidateSttInputHashAtom),
        consolidateSttInputIndex: get(consolidateSttInputIndexAtom),
        consolidateWalletInputs: get(consolidateWalletInputsAtom) };
      return inputs.beneficiaryPreparationActive
        ? { ...inputs, beneficiaryPreparationPoolAssets: get(beneficiaryPreparationPoolAssetsAtom) }
        : { ...inputs, consolidateAuthorityPath: get(consolidateAuthorityPathAtom),
            consolidateSttAssets: get(consolidateSttAssetsAtom), consolidateWalletOutputs: get(consolidateWalletOutputsAtom) };
    }
    case "stop-beneficiary-stream":
      return { config, sttInputTxHash: get(sttInputTxHashAtom), sttInputOutputIndex: get(sttInputOutputIndexAtom),
        beneficiaryStreamStopId: get(beneficiaryStreamStopIdAtom) };
    case "distribute-beneficiaries":
      return { config, sttInputTxHash: get(sttInputTxHashAtom), sttInputOutputIndex: get(sttInputOutputIndexAtom),
        sttWalletInputs: get(sttWalletInputsAtom) };
    default: {
      const inputs = { config, sttInputTxHash: get(sttInputTxHashAtom),
        sttInputOutputIndex: get(sttInputOutputIndexAtom), sttAuthorityPath: get(sttAuthorityPathAtom) };
      switch (action) {
        case "use":
          return { ...inputs, sttOutputAssets: get(sttOutputAssetsAtom), sttWalletInputs: get(sttWalletInputsAtom),
            sttWalletOutputs: get(sttWalletOutputsAtom), sttExtraTransfers: get(sttExtraTransfersAtom),
            sttProofOfLifeOverrideMode: get(sttProofOfLifeOverrideModeAtom),
            sttProofOfLifeSpecificDateTime: get(sttProofOfLifeSpecificDateTimeAtom),
            zeroAdminConfirmed: get(sttZeroAdminConfirmedAtom) };
        case "renew-proof-of-life":
          // These collections must stay empty. Validation changes also retire a build.
          return { ...inputs, sttOutputAssets: get(sttOutputAssetsAtom), sttWalletOutputs: get(sttWalletOutputsAtom),
            sttExtraTransfers: get(sttExtraTransfersAtom), sttProofOfLifeOverrideMode: get(sttProofOfLifeOverrideModeAtom),
            sttProofOfLifeSpecificDateTime: get(sttProofOfLifeSpecificDateTimeAtom) };
        case "update-state":
          return { ...inputs, updateStateForm: get(updateStateFormAtom) ?? withBeneficiarySigningAddressesDerived(get(sttStateFormAtom)),
            sttOutputAssets: get(sttOutputAssetsAtom), sttWalletOutputs: get(sttWalletOutputsAtom),
            sttExtraTransfers: get(sttExtraTransfersAtom), zeroAdminConfirmed: get(sttZeroAdminConfirmedAtom) };
        case "manage-streaming-payments":
          return { ...inputs, sttStateForm: get(sttStateFormAtom), sttOutputAssets: get(sttOutputAssetsAtom),
            sttWalletOutputs: get(sttWalletOutputsAtom), sttExtraTransfers: get(sttExtraTransfersAtom),
            zeroAdminConfirmed: get(sttZeroAdminConfirmedAtom) };
        case "use-allowance":
        case "use-beneficiary":
          return { ...inputs, sttWalletInputs: get(sttWalletInputsAtom), sttExtraTransfers: get(sttExtraTransfersAtom) };
        case "payout-streaming-payment":
          return { ...inputs, sttWalletInputs: get(sttWalletInputsAtom),
            streamingPaymentPayoutAmounts: get(streamingPaymentPayoutAmountsAtom) };
      }
    }
  }
}
