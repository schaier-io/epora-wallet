import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibMeshTransactionsPreviewCopy.json";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import type { StakeCredentialSelection } from "@/lib/types/contracts";

const i18n = createDefaultTranslator("LibMeshTransactionsPreviewCopy", defaultMessages);

export function formatReferenceScriptUsage(count: number) {
  return count > 0 ? i18n("referenceScriptUsage", { count }) : "";
}

export function formatAmountPreview(lovelace: string, nativeAssetCount: number) {
  return i18n("amount", { lovelace, nativeAssetCount });
}

export function formatSharedReferenceDeployment(input: {
  address: string;
  exactAmount: boolean;
  appliedLovelace: string;
  requestedLovelace: string;
  duplicateMode: boolean;
  existingReferenceCount: number;
}) {
  const values = {
    address: input.address,
    appliedAda: formatLovelaceAsAda(input.appliedLovelace),
    requestedAda: formatLovelaceAsAda(input.requestedLovelace),
    existingReferenceCount: input.existingReferenceCount
  };
  if (input.exactAmount) {
    return input.duplicateMode
      ? i18n("deployExactWithDuplicates", values)
      : i18n("deployExact", values);
  }
  return input.duplicateMode
    ? i18n("deployAdjustedWithDuplicates", values)
    : i18n("deployAdjusted", values);
}

export function formatConsolidationPreview(
  inputCount: number,
  outputCount: number,
  referenceScriptUsage: string
) {
  return i18n("consolidation", { inputCount, outputCount, referenceScriptUsage });
}

export function formatGovernancePreview(
  action: "publish" | "vote",
  referenceScriptUsage: string
) {
  return i18n(action === "vote" ? "governanceVote" : "governancePublish", {
    referenceScriptUsage
  });
}

export function formatStakeCredentialPreview(
  kind: StakeCredentialSelection["kind"],
  referenceScriptUsage: string
) {
  return i18n(
    kind === "none"
      ? "stakeCredentialNone"
      : kind === "key"
        ? "stakeCredentialKey"
        : "stakeCredentialScript",
    { referenceScriptUsage }
  );
}

export function formatWalletSpendPreview(referenceScriptUsage: string) {
  return i18n("walletSpend", { referenceScriptUsage });
}

export function formatRewardWithdrawalPreview(
  lovelace: string,
  rewardAddress: string,
  referenceScriptUsage: string
) {
  return i18n("rewardWithdrawal", {
    ada: formatLovelaceAsAda(lovelace),
    rewardAddress,
    referenceScriptUsage
  });
}

export function formatWalletCreationPreview(input: {
  walletName: string;
  walletAddress: string;
  starterSummary: string;
  referenceScriptUsage: string;
}) {
  return i18n(input.walletAddress ? "walletCreation" : "walletCreationAtNewAddress", input);
}

export function formatLockFundsPreview(assetCount: number, walletAddress: string) {
  return i18n("lockFunds", { assetCount, walletAddress });
}
