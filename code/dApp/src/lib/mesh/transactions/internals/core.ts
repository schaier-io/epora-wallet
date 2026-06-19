import { type RuntimeTxBuilder } from "./budget";
import {
  MIN_COLLATERAL_LOVELACE,
  NETWORK,
  VALIDITY_WINDOW_FUTURE_MS,
  VALIDITY_WINDOW_PAST_MS
} from "./constants";
import { createStageError, withStage } from "./errors";
import { excludeReservedUtxos, hasReferenceScript } from "./reference-scripts";
import { createInputRefKey, resolveChangeAddress, resolveManualCollateralCandidate, resolveWalletUtxos } from "./utxo";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { type ContractConfig } from "@/lib/types/contracts";
import { type IInitiator } from "@meshsdk/common";
import { type BrowserWallet, SLOT_CONFIG_NETWORK, Transaction, type UTxO, slotToBeginUnixTime, unixTimeToEnclosingSlot } from "@meshsdk/core";

export function resolveSttScriptParams(config: ContractConfig) {
  const sttPolicyId = config.walletPolicyId?.trim() ?? "";
  const sttAssetNameHex = (config.walletAssetNameHex ?? config.sttAssetNameHex).trim();

  if (!sttPolicyId || !sttAssetNameHex) {
    throw new Error("STT policy ID and asset name are required for STT actions.");
  }

  return { sttPolicyId, sttAssetNameHex };
}



export function isPureLovelaceUtxo(utxo: UTxO) {
  return (
    !hasReferenceScript(utxo) &&
    utxo.output.amount.length === 1 &&
    utxo.output.amount[0]?.unit === "lovelace"
  );
}



export function getValidityWindow(referenceTimeMs = Date.now()) {
  const slotConfig = SLOT_CONFIG_NETWORK[NETWORK];
  const invalidBefore =
    unixTimeToEnclosingSlot(referenceTimeMs - VALIDITY_WINDOW_PAST_MS, slotConfig) - 1;
  const invalidHereafter =
    unixTimeToEnclosingSlot(referenceTimeMs + VALIDITY_WINDOW_FUTURE_MS, slotConfig) + 1;

  return {
    invalidBefore,
    invalidHereafter,
    earliestTimeMs: slotToBeginUnixTime(invalidBefore, slotConfig),
    latestTimeMs: slotToBeginUnixTime(invalidHereafter, slotConfig)
  };
}



export async function setupTransaction(
  wallet: BrowserWallet,
  validityWindowReferenceTimeMs = Date.now()
) {
  const fetcher = new ServerFetcher();
  const { walletUtxos, source: utxosSource, addressCandidates, diagnostics } =
    await resolveWalletUtxos(wallet, fetcher);
  const {
    changeAddress,
    source: changeAddressSource,
    diagnostics: changeAddressDiagnostics
  } = await resolveChangeAddress(wallet, walletUtxos, addressCandidates);
  const spendableWalletUtxos = walletUtxos.filter((utxo) => !hasReferenceScript(utxo));
  const referenceScriptWalletUtxos = walletUtxos.filter((utxo) =>
    hasReferenceScript(utxo)
  );
  const reservedInputRefs = new Set<string>();

  const setupDiagnostics: Record<string, unknown> = {
    utxosSource,
    walletUtxoCount: walletUtxos.length,
    spendableWalletUtxoCount: spendableWalletUtxos.length,
    walletReferenceScriptUtxoCount: referenceScriptWalletUtxos.length,
    changeAddressSource,
    changeAddress,
    addressCandidates,
    evaluatorSource: "blockfrost-via-server-route",
    protocolParametersSource: "blockfrost-epochs-latest-parameters",
    utxoResolutionDiagnostics: diagnostics,
    changeAddressDiagnostics
  };

  const safeInitiator: IInitiator = {
    getUtxos: async () => excludeReservedUtxos(spendableWalletUtxos, reservedInputRefs),
    getChangeAddress: async () => changeAddress,
    getCollateral: async () => []
  };
  const tx = new Transaction({
    initiator: safeInitiator,
    fetcher,
    evaluator: fetcher
  });
  const txBuilder = tx.txBuilder as RuntimeTxBuilder;
  const originalBuild = tx.build.bind(tx);
  let manualCollateralApplied = false;

  tx.build = async (balanced = true) => {
    if (tx.isCollateralNeeded && !manualCollateralApplied) {
      const collateralResolution = resolveManualCollateralCandidate(
        spendableWalletUtxos,
        reservedInputRefs
      );

      if (!collateralResolution.collateral) {
        throw createStageError(
          "setup:manualCollateral",
          new Error(
            "No suitable ADA-only wallet UTxO found for manual script collateral. Keep one pure ADA UTxO with at least 5 ADA in the connected wallet."
          ),
          {
            ...setupDiagnostics,
            collateralMode: "manual-builder-input",
            collateralSource: collateralResolution.source,
            unreservedPureLovelaceUtxoCount:
              collateralResolution.unreservedPureLovelaceUtxoCount,
            walletPureLovelaceUtxoCount:
              collateralResolution.walletPureLovelaceUtxoCount,
            reservedInputRefs: [...reservedInputRefs]
          }
        );
      }

      if (
        typeof txBuilder.txInCollateral !== "function" ||
        typeof txBuilder.setTotalCollateral !== "function"
      ) {
        throw createStageError(
          "setup:manualCollateral",
          new Error("Mesh transaction builder cannot set manual collateral inputs."),
          { ...setupDiagnostics, collateralMode: "manual-builder-input" }
        );
      }

      txBuilder
        .txInCollateral(
          collateralResolution.collateral.input.txHash,
          collateralResolution.collateral.input.outputIndex,
          collateralResolution.collateral.output.amount,
          collateralResolution.collateral.output.address
        )
        .setTotalCollateral(MIN_COLLATERAL_LOVELACE.toString());
      txBuilder.setCollateralReturnAddress?.(changeAddress);
      manualCollateralApplied = true;
      setupDiagnostics.collateralMode = "manual-builder-input";
      setupDiagnostics.collateralSource = collateralResolution.source;
      setupDiagnostics.manualCollateral = {
        reference: createInputRefKey(
          collateralResolution.collateral.input.txHash,
          collateralResolution.collateral.input.outputIndex
        ),
        amount: collateralResolution.collateral.output.amount,
        totalCollateral: MIN_COLLATERAL_LOVELACE.toString(),
        returnAddress: changeAddress
      };
    }

    tx.isCollateralNeeded = false;
    return originalBuild(balanced);
  };

  if (walletUtxos.length === 0) {
    throw createStageError(
      "setup:txInputs",
      new Error("Connected wallet has no available UTxOs."),
      setupDiagnostics
    );
  }

  if (spendableWalletUtxos.length === 0) {
    throw createStageError(
      "setup:txInputs",
      new Error(
        "Connected wallet only has reference-script UTxOs available for spending. Fund the wallet with a separate non-reference UTxO or lock those reference UTxOs in the wallet UI."
      ),
      setupDiagnostics
    );
  }

  await withStage(
    "setup:configureTx",
    async () => {
      const protocolParams = await fetcher.fetchProtocolParameters();

      txBuilder.protocolParams?.(protocolParams);
      txBuilder.selectUtxosFrom?.(spendableWalletUtxos);
      tx.setChangeAddress(changeAddress).setRequiredSigners([changeAddress]);
      tx.setNetwork(NETWORK);

      const { invalidBefore, invalidHereafter } = getValidityWindow(
        validityWindowReferenceTimeMs
      );
      tx.txBuilder.invalidBefore(invalidBefore);
      tx.txBuilder.invalidHereafter(invalidHereafter);
    },
    setupDiagnostics
  );

  return {
    tx,
    fetcher,
    changeAddress,
    walletUtxos,
    spendableWalletUtxos,
    setupDiagnostics,
    reserveInputRef: (txHash: string, outputIndex: number) => {
      reservedInputRefs.add(createInputRefKey(txHash, outputIndex));
    }
  };
}


