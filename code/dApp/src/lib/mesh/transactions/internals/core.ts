import { readWalletAuthorityAddress } from "@/lib/wallet/authority-address";
import { type RuntimeTxBuilder } from "./budget-runtime-builder";
import {
  MIN_COLLATERAL_LOVELACE,
  NETWORK,
  VALIDITY_WINDOW_FUTURE_MS,
  VALIDITY_WINDOW_PAST_MS
} from "./constants";
import { createStageError, withStage } from "./errors";
import { excludeReservedUtxos, hasReferenceScript } from "./reference-scripts";
import { applyManualCollateral, createInputRefKey, resolveChangeAddress, resolveManualCollateralCandidate, resolveWalletUtxos } from "./utxo";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { type TxFetcher, type WalletSource } from "@/lib/mesh/tx-context";
import { type ContractConfig } from "@/lib/types/contracts";
import { type IInitiator } from "@meshsdk/common";
import { SLOT_CONFIG_NETWORK, Transaction, type MeshTxBuilderOptions, type UTxO, slotToBeginUnixTime, unixTimeToEnclosingSlot } from "@meshsdk/core";

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
  wallet: WalletSource,
  validityWindowReferenceTimeMs = Date.now(),
  // Injected so a server-side build can reach the chain provider directly.
  // The browser default is unchanged: its own /api/mesh RPC proxy.
  fetcher: TxFetcher = new ServerFetcher(),
  options?: {
    selector?: MeshTxBuilderOptions["selector"];
    excludedSelectionInputRefs?: Set<string>;
  }
) {
  const { walletUtxos, source: utxosSource, addressCandidates, diagnostics } =
    await resolveWalletUtxos(wallet, fetcher);
  const {
    changeAddress,
    source: changeAddressSource,
    diagnostics: changeAddressDiagnostics
  } = await resolveChangeAddress(wallet, walletUtxos, addressCandidates);
  const signerAddress = await readWalletAuthorityAddress(wallet);
  if (!signerAddress) throw new Error("Connected wallet returned no authority address.");
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
    evaluator: fetcher,
    selector: options?.selector
  });
  const txBuilder = tx.txBuilder as RuntimeTxBuilder;
  const originalBuild = tx.build.bind(tx);
  let manualCollateralApplied = false;

  tx.build = async (balanced = true) => {
    if (tx.isCollateralNeeded && !manualCollateralApplied) {
      const collateralResolution = resolveManualCollateralCandidate(
        spendableWalletUtxos,
        reservedInputRefs,
        txBuilder._protocolParams
      );

      if (!collateralResolution.collateral) {
        throw createStageError(
          "setup:manualCollateral",
          new Error(
            "No wallet UTxO can cover script collateral. Collateral needs either a pure-ADA UTxO holding exactly the 5 ADA deposit, or one UTxO whose lovelace covers the deposit plus the min-UTxO of its collateral return output. Native tokens in that second UTxO are returned, so they do not disqualify it."
          ),
          {
            ...setupDiagnostics,
            collateralMode: "manual-builder-input",
            collateralSource: collateralResolution.source,
            unreservedCollateralCandidateCount:
              collateralResolution.unreservedCollateralCandidateCount,
            walletCollateralCandidateCount:
              collateralResolution.walletCollateralCandidateCount,
            reservedInputRefs: [...reservedInputRefs]
          }
        );
      }

      // Babbage collateral: declaring `totalCollateral` makes the builder add a
      // collateral return output for everything above the deposit, native
      // tokens included, so the collateral UTxO does not have to be ADA-only.
      //
      // The exception is a pure-ADA UTxO holding exactly the deposit. Mesh adds
      // the return output for any truthy `totalCollateral`, and its value is
      // `sum(collateral) - totalCollateral`, which is 0 here. A 0-lovelace
      // output fails the ledger's min-UTxO check, so applyManualCollateral
      // declares no total at all and lets the ledger consume the whole input.
      let returnFreeCollateral: boolean;
      try {
        returnFreeCollateral = applyManualCollateral(
          txBuilder,
          collateralResolution.collateral,
          changeAddress
        );
      } catch (error) {
        throw createStageError("setup:manualCollateral", error, {
          ...setupDiagnostics,
          collateralMode: "manual-builder-input"
        });
      }

      options?.excludedSelectionInputRefs?.add(
        createInputRefKey(
          collateralResolution.collateral.input.txHash,
          collateralResolution.collateral.input.outputIndex
        )
      );
      manualCollateralApplied = true;
      setupDiagnostics.collateralMode = "manual-builder-input";
      setupDiagnostics.collateralSource = collateralResolution.source;
      setupDiagnostics.manualCollateral = {
        reference: createInputRefKey(
          collateralResolution.collateral.input.txHash,
          collateralResolution.collateral.input.outputIndex
        ),
        amount: collateralResolution.collateral.output.amount,
        totalCollateral: returnFreeCollateral ? null : MIN_COLLATERAL_LOVELACE.toString(),
        returnAddress: returnFreeCollateral ? null : changeAddress,
        returnFreeCollateral
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
      tx.setChangeAddress(changeAddress).setRequiredSigners([signerAddress]);
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
    signerAddress,
    changeAddress,
    walletUtxos,
    spendableWalletUtxos,
    setupDiagnostics,
    reserveInputRef: (txHash: string, outputIndex: number) => {
      reservedInputRefs.add(createInputRefKey(txHash, outputIndex));
    }
  };
}
