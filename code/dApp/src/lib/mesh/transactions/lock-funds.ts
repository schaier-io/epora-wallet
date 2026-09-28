import { assertValidAssetList, assertValidOptionalConstrData, buildTransactionWithReestimatedLimits, createEmptyExecutionValidatorLabels, createTxPreview, dropZeroQuantityAssets, recipientWithOptionalInlineDatum, setupTransaction } from "./internals";
import { formatLockFundsPreview } from "./preview-copy";
import { resolveWalletContinuingOutputAddress } from "@/lib/contracts/blueprint";
import { type BuildResult, type ContractConfig, type LockFundsFormInput } from "@/lib/types/contracts";
import { type TxFetcher, type WalletSource } from "@/lib/mesh/tx-context";

export async function buildLockFundsTx(
  wallet: WalletSource,
  config: ContractConfig,
  input: LockFundsFormInput,
  txFetcher?: TxFetcher
): Promise<BuildResult> {
  if (!config.walletPolicyId || !config.walletAssetNameHex) {
    throw new Error("Wallet script parameters are missing. Set policy ID and asset name.");
  }

  if (input.assets.length === 0) {
    throw new Error("Add at least one asset before building a lock transaction.");
  }

  assertValidAssetList(input.assets, "Lock funds assets");
  assertValidOptionalConstrData(input.inlineDatum, "Lock funds inline datum");
  // The editors seed new rows at "0"; a row left there reaches Mesh's output
  // verbatim and the ledger rejects the signed transaction. Zero rows carry no
  // value, so they are dropped here rather than rejected.
  const assets = dropZeroQuantityAssets(input.assets);
  if (assets.length === 0) {
    throw new Error("Every asset row is zero. Enter an amount greater than zero.");
  }
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
    async (_overrides, buildFetcher) => {
      const { tx, signerAddress, setupDiagnostics } = await setupTransaction(wallet, undefined, buildFetcher);

      tx.sendAssets(
        recipientWithOptionalInlineDatum(walletAddress, input.inlineDatum),
        assets
      );

      return {
        tx,
        signerAddress,
        diagnostics: {
          ...setupDiagnostics,
          walletAddress,
          assetCount: assets.length,
          inlineDatum: input.inlineDatum
        },
        executionLabels: createEmptyExecutionValidatorLabels()
      };
    },
    txFetcher
  );

  return {
    txHex: prepared.txHex,
    preview: createTxPreview(
      "lock-funds",
      formatLockFundsPreview(assets.length, walletAddress),
      prepared.txHex
    ),
    estimatedFeeLovelace: prepared.estimatedFeeLovelace,
    signerAddress: prepared.signerAddress,
    executionUnits: prepared.executionUnits
  };
}
