import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { consolidateSttAssetsAtom, consolidateSttInputHashAtom, consolidateSttInputIndexAtom, consolidateWalletInputsAtom, consolidateWalletOutputsAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import { lockFundsAssetsAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";
import { mintReferenceAtom, mintStarterAssetsAtom, mintStateFormAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { proposalJsonAtom, proposalSttAssetsAtom, proposalSttInputHashAtom, proposalSttInputIndexAtom, proposalSttStateFormAtom } from "@/components/user/workspace/atoms/forms/propose-form.atoms";
import { publishCertificateJsonAtom, publishSttAssetsAtom, publishSttInputHashAtom, publishSttInputIndexAtom, publishSttStateFormAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import { consolidateAuthorityPathAtom, sttAuthorityPathAtom, sttExtraTransfersAtom, sttInputOutputIndexAtom, sttInputTxHashAtom, sttOutputAssetsAtom, sttProofOfLifeOverrideModeAtom, sttProofOfLifeSpecificDateTimeAtom, sttStateFormAtom, sttWalletInputsAtom, sttWalletOutputsAtom, walletOperatorPathAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { walletSpendInputHashAtom, walletSpendInputIndexAtom, walletSpendOutputsAtom, walletSpendRedeemerPresetAtom } from "@/components/user/workspace/atoms/forms/wallet-spend-form.atoms";
import { withdrawAmountAtom, withdrawRewardAddressAtom, withdrawSttAssetsAtom, withdrawSttInputHashAtom, withdrawSttInputIndexAtom, withdrawSttStateFormAtom } from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";
import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";

// Snapshots every form atom the transaction builders read, in one place, so the
// factory separates "gather the current form inputs" from "build the tx". Read
// at call time, exactly as before — no behavior change.
export function resolveWorkspaceTransactionInputs(
  jotaiStore: WorkspaceTransactionsCtx["jotaiStore"]
) {
  return {
    config: jotaiStore.get(configAtom),
    consolidateAuthorityPath: jotaiStore.get(consolidateAuthorityPathAtom),
    consolidateSttAssets: jotaiStore.get(consolidateSttAssetsAtom),
    consolidateSttInputHash: jotaiStore.get(consolidateSttInputHashAtom),
    consolidateSttInputIndex: jotaiStore.get(consolidateSttInputIndexAtom),
    consolidateWalletInputs: jotaiStore.get(consolidateWalletInputsAtom),
    consolidateWalletOutputs: jotaiStore.get(consolidateWalletOutputsAtom),
    lockFundsAssets: jotaiStore.get(lockFundsAssetsAtom),
    mintReference: jotaiStore.get(mintReferenceAtom),
    mintStarterAssets: jotaiStore.get(mintStarterAssetsAtom),
    mintStateForm: jotaiStore.get(mintStateFormAtom),
    proposalJson: jotaiStore.get(proposalJsonAtom),
    proposalSttAssets: jotaiStore.get(proposalSttAssetsAtom),
    proposalSttInputHash: jotaiStore.get(proposalSttInputHashAtom),
    proposalSttInputIndex: jotaiStore.get(proposalSttInputIndexAtom),
    proposalSttStateForm: jotaiStore.get(proposalSttStateFormAtom),
    publishCertificateJson: jotaiStore.get(publishCertificateJsonAtom),
    publishSttAssets: jotaiStore.get(publishSttAssetsAtom),
    publishSttInputHash: jotaiStore.get(publishSttInputHashAtom),
    publishSttInputIndex: jotaiStore.get(publishSttInputIndexAtom),
    publishSttStateForm: jotaiStore.get(publishSttStateFormAtom),
    sttAuthorityPath: jotaiStore.get(sttAuthorityPathAtom),
    sttExtraTransfers: jotaiStore.get(sttExtraTransfersAtom),
    sttInputOutputIndex: jotaiStore.get(sttInputOutputIndexAtom),
    sttInputTxHash: jotaiStore.get(sttInputTxHashAtom),
    sttOutputAssets: jotaiStore.get(sttOutputAssetsAtom),
    sttProofOfLifeOverrideMode: jotaiStore.get(sttProofOfLifeOverrideModeAtom),
    sttProofOfLifeSpecificDateTime: jotaiStore.get(sttProofOfLifeSpecificDateTimeAtom),
    sttStateForm: jotaiStore.get(sttStateFormAtom),
    sttWalletInputs: jotaiStore.get(sttWalletInputsAtom),
    sttWalletOutputs: jotaiStore.get(sttWalletOutputsAtom),
    walletOperatorPath: jotaiStore.get(walletOperatorPathAtom),
    walletSpendInputHash: jotaiStore.get(walletSpendInputHashAtom),
    walletSpendInputIndex: jotaiStore.get(walletSpendInputIndexAtom),
    walletSpendOutputs: jotaiStore.get(walletSpendOutputsAtom),
    walletSpendRedeemerPreset: jotaiStore.get(walletSpendRedeemerPresetAtom),
    withdrawAmount: jotaiStore.get(withdrawAmountAtom),
    withdrawRewardAddress: jotaiStore.get(withdrawRewardAddressAtom),
    withdrawSttAssets: jotaiStore.get(withdrawSttAssetsAtom),
    withdrawSttInputHash: jotaiStore.get(withdrawSttInputHashAtom),
    withdrawSttInputIndex: jotaiStore.get(withdrawSttInputIndexAtom),
    withdrawSttStateForm: jotaiStore.get(withdrawSttStateFormAtom)
  };
}
