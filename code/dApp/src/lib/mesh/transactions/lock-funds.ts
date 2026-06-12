import { assertValidAssetList, assertValidOptionalConstrData, buildTransactionWithReestimatedLimits, createEmptyExecutionValidatorLabels, createTxPreview, recipientWithOptionalInlineDatum, setupTransaction } from "./internals";
import { resolveWalletContinuingOutputAddress } from "@/lib/contracts/blueprint";
import { type BuildResult, type ContractConfig, type LockFundsFormInput } from "@/lib/types/contracts";
import { type BrowserWallet } from "@meshsdk/core";

export async function buildLockFundsTx(
  wallet: BrowserWallet,
  config: ContractConfig,
  input: LockFundsFormInput
): Promise<BuildResult> {
  if (!config.walletPolicyId || !config.walletAssetNameHex) {
    throw new Error("Wallet script parameters are missing. Set policy ID and asset name.");
  }

  if (input.assets.length === 0) {
    throw new Error("Add at least one asset before building a lock transaction.");
  }

  assertValidAssetList(input.assets, "Lock funds assets");
  assertValidOptionalConstrData(input.inlineDatum, "Lock funds inline datum");
  const walletPolicyId = config.walletPolicyId;
  const walletAssetNameHex = config.walletAssetNameHex;
  // Deposit to the wallet's canonical address: a staking (Some) wallet receives
  // funds at its base address so they share the wallet's stake credential; with
  // no credential supplied this returns the exact historical enterprise address.
  const walletAddress = resolveWalletContinuingOutputAddress({
    sttPolicyId: walletPolicyId,
    sttAssetNameHex: walletAssetNameHex,
    intendedStakeCredential: input.intendedStakeCredential
  });
  const prepared = await buildTransactionWithReestimatedLimits(
    "lock-funds:tx.draft-build",
    "lock-funds:tx.build",
    async () => {
      const { tx, setupDiagnostics } = await setupTransaction(wallet);

      tx.sendAssets(
        recipientWithOptionalInlineDatum(walletAddress, input.inlineDatum),
        input.assets
      );

      return {
        tx,
        diagnostics: {
          ...setupDiagnostics,
          walletAddress,
          assetCount: input.assets.length,
          inlineDatum: input.inlineDatum
        },
        executionLabels: createEmptyExecutionValidatorLabels()
      };
    }
  );

  return {
    txHex: prepared.txHex,
    preview: createTxPreview(
      "lock-funds",
      `Lock ${input.assets.length} asset entr${input.assets.length === 1 ? "y" : "ies"} at ${walletAddress}`,
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    executionUnits: prepared.executionUnits
  };
}

