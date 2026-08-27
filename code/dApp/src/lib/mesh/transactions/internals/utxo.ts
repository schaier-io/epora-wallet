import { type RuntimeTxBuilder } from "./budget-runtime-builder";
import { MIN_COLLATERAL_LOVELACE } from "./constants";
import { isPureLovelaceUtxo } from "./core";
import { createStageError, normalizeError } from "./errors";
import { excludeReservedUtxos } from "./reference-scripts";
import { type ServerFetcher } from "@/lib/mesh/server-fetcher";
import {
  type ConsolidateUtxosFormInput,
  type WalletInputRef
} from "@/lib/types/contracts";
import { deserializeAddress, type BrowserWallet, type UTxO } from "@meshsdk/core";

type UtxoResolution = {
  walletUtxos: UTxO[];
  source: "wallet.getUtxos" | "fetchAddressUTxOs";
  addressCandidates: string[];
  diagnostics: Record<string, unknown>;
};



export function compareInputRefs(left: string, right: string) {
  return left.localeCompare(right, "en", { sensitivity: "base" });
}



export function createInputRefKey(txHash: string, outputIndex: number) {
  return `${txHash}#${outputIndex}`;
}



export function dedupeUtxos(utxos: UTxO[]): UTxO[] {
  const map = new Map<string, UTxO>();

  for (const utxo of utxos) {
    const key = `${utxo.input.txHash}#${utxo.input.outputIndex}`;
    if (!map.has(key)) {
      map.set(key, utxo);
    }
  }

  return [...map.values()];
}



function getUtxoLovelace(utxo: UTxO) {
  return BigInt(utxo.output.amount[0]?.quantity ?? "0");
}



function compareLovelaceAscending(left: UTxO, right: UTxO) {
  const diff = getUtxoLovelace(left) - getUtxoLovelace(right);
  if (diff < 0n) return -1;
  if (diff > 0n) return 1;
  return 0;
}



function selectManualCollateralCandidate(utxos: UTxO[]) {
  return (
    utxos
      .filter(
        (utxo) =>
          isPureLovelaceUtxo(utxo) &&
          getUtxoLovelace(utxo) >= BigInt(MIN_COLLATERAL_LOVELACE)
      )
      .sort(compareLovelaceAscending)[0] ?? null
  );
}



export function resolveManualCollateralCandidate(
  spendableWalletUtxos: UTxO[],
  reservedRefs: Set<string>
) {
  const unreservedUtxos = excludeReservedUtxos(spendableWalletUtxos, reservedRefs);
  const unreservedCandidate = selectManualCollateralCandidate(unreservedUtxos);
  if (unreservedCandidate) {
    return {
      collateral: unreservedCandidate,
      source: "manual.unreserved-wallet-utxo" as const,
      unreservedPureLovelaceUtxoCount: unreservedUtxos.filter(isPureLovelaceUtxo).length,
      walletPureLovelaceUtxoCount: spendableWalletUtxos.filter(isPureLovelaceUtxo).length
    };
  }

  const reservedFallbackCandidate = selectManualCollateralCandidate(spendableWalletUtxos);
  if (reservedFallbackCandidate) {
    return {
      collateral: reservedFallbackCandidate,
      source: "manual.reserved-wallet-utxo" as const,
      unreservedPureLovelaceUtxoCount: unreservedUtxos.filter(isPureLovelaceUtxo).length,
      walletPureLovelaceUtxoCount: spendableWalletUtxos.filter(isPureLovelaceUtxo).length
    };
  }

  return {
    collateral: null,
    source: "manual.wallet-utxos-unavailable" as const,
    unreservedPureLovelaceUtxoCount: unreservedUtxos.filter(isPureLovelaceUtxo).length,
    walletPureLovelaceUtxoCount: spendableWalletUtxos.filter(isPureLovelaceUtxo).length
  };
}



async function collectFallbackAddresses(
  wallet: BrowserWallet,
  diagnostics: Record<string, unknown>
): Promise<string[]> {
  const addressSet = new Set<string>();

  try {
    const changeAddress = await wallet.getChangeAddress();
    diagnostics.changeAddressCandidate = changeAddress;
    if (changeAddress) {
      addressSet.add(changeAddress);
    }
  } catch (error) {
    diagnostics.getChangeAddressError = normalizeError(error);
  }

  try {
    const usedAddresses = await wallet.getUsedAddresses();
    diagnostics.usedAddressCount = usedAddresses.length;
    for (const address of usedAddresses) {
      addressSet.add(address);
    }
  } catch (error) {
    diagnostics.getUsedAddressesError = normalizeError(error);
  }

  try {
    const unusedAddresses = await wallet.getUnusedAddresses();
    diagnostics.unusedAddressCount = unusedAddresses.length;
    for (const address of unusedAddresses) {
      addressSet.add(address);
    }
  } catch (error) {
    diagnostics.getUnusedAddressesError = normalizeError(error);
  }

  return [...addressSet];
}



export async function resolveWalletUtxos(
  wallet: BrowserWallet,
  fetcher: ServerFetcher
): Promise<UtxoResolution> {
  const diagnostics: Record<string, unknown> = {};

  try {
    const walletUtxos = await wallet.getUtxos();
    diagnostics.walletGetUtxosCount = walletUtxos.length;

    if (walletUtxos.length > 0) {
      return {
        walletUtxos,
        source: "wallet.getUtxos",
        addressCandidates: [],
        diagnostics
      };
    }

    diagnostics.walletGetUtxosEmpty = true;
  } catch (error) {
    diagnostics.walletGetUtxosError = normalizeError(error);
  }

  const addressCandidates = await collectFallbackAddresses(wallet, diagnostics);
  diagnostics.addressCandidateCount = addressCandidates.length;

  if (addressCandidates.length === 0) {
    throw createStageError(
      "setup:getUtxos",
      new Error("Wallet returned no UTxOs and no fallback addresses."),
      diagnostics
    );
  }

  const fallbackUtxos: UTxO[] = [];
  const fetchAddressErrors: Array<{ address: string; error: Record<string, unknown> }> = [];

  for (const address of addressCandidates) {
    try {
      const addressUtxos = await fetcher.fetchAddressUTxOs(address);
      fallbackUtxos.push(...addressUtxos);
    } catch (error) {
      fetchAddressErrors.push({ address, error: normalizeError(error) });
    }
  }

  diagnostics.fallbackFetchAddressErrors = fetchAddressErrors;
  const dedupedUtxos = dedupeUtxos(fallbackUtxos);
  diagnostics.fallbackUtxoCount = dedupedUtxos.length;

  if (dedupedUtxos.length === 0) {
    throw createStageError(
      "setup:getUtxos:fallback",
      new Error("Unable to resolve wallet UTxOs from fallback addresses."),
      diagnostics
    );
  }

  return {
    walletUtxos: dedupedUtxos,
    source: "fetchAddressUTxOs",
    addressCandidates,
    diagnostics
  };
}



export async function resolveChangeAddress(
  wallet: BrowserWallet,
  walletUtxos: UTxO[],
  addressCandidates: string[]
) {
  const diagnostics: Record<string, unknown> = {};

  try {
    const changeAddress = await wallet.getChangeAddress();
    if (changeAddress) {
      return {
        changeAddress,
        source: "wallet.getChangeAddress",
        diagnostics
      };
    }

    diagnostics.walletChangeAddressEmpty = true;
  } catch (error) {
    diagnostics.walletGetChangeAddressError = normalizeError(error);
  }

  if (addressCandidates.length > 0) {
    return {
      changeAddress: addressCandidates[0]!,
      source: "fallback.addressCandidates",
      diagnostics
    };
  }

  const utxoAddress = walletUtxos[0]?.output.address;
  if (utxoAddress) {
    return {
      changeAddress: utxoAddress,
      source: "fallback.walletUtxoAddress",
      diagnostics
    };
  }

  throw createStageError(
    "setup:getChangeAddress",
    new Error("Unable to resolve change address from wallet."),
    diagnostics
  );
}



export function addWalletInput(txBuilder: RuntimeTxBuilder, utxo: UTxO) {
  if (typeof txBuilder.txIn !== "function") {
    throw new Error(
      "Mesh transaction builder is missing txIn(), so mint cannot reserve a wallet reference input."
    );
  }

  txBuilder.txIn(
    utxo.input.txHash,
    utxo.input.outputIndex,
    utxo.output.amount,
    utxo.output.address,
    utxo.output.scriptRef ? utxo.output.scriptRef.length / 2 : 0
  );
}



export function findUtxo(utxos: UTxO[], txHash: string, outputIndex?: number) {
  const found = utxos.find((utxo) => {
    if (utxo.input.txHash !== txHash) return false;
    if (typeof outputIndex === "number") {
      return utxo.input.outputIndex === outputIndex;
    }

    return true;
  });

  if (!found) {
    throw new Error(`UTxO not found: ${txHash}${typeof outputIndex === "number" ? `#${outputIndex}` : ""}`);
  }

  return found;
}

/**
 * Resolve wallet-script inputs by their exact references. Address scans cannot
 * find a wallet UTxO that still has the right payment script but carries an old
 * or otherwise non-canonical stake credential, so migration and terminal
 * recovery flows must fetch the references directly.
 */
export async function resolveExactWalletInputUtxos(
  fetcher: Pick<ServerFetcher, "fetchUTxOs">,
  refs: WalletInputRef[],
  expectedPaymentScriptHash: string
): Promise<UTxO[]> {
  return Promise.all(
    refs.map(async (ref) => {
      const candidates = await fetcher.fetchUTxOs(ref.txHash, ref.outputIndex);
      const utxo = findUtxo(candidates, ref.txHash, ref.outputIndex);

      let actualPaymentScriptHash: string;
      try {
        const address = deserializeAddress(utxo.output.address);
        actualPaymentScriptHash = address.scriptHash;
      } catch {
        throw new Error(
          `Wallet input ${createInputRefKey(ref.txHash, ref.outputIndex)} has an invalid Cardano address.`
        );
      }

      if (
        !actualPaymentScriptHash ||
        actualPaymentScriptHash.toLowerCase() !== expectedPaymentScriptHash.toLowerCase()
      ) {
        throw new Error(
          `Wallet input ${createInputRefKey(ref.txHash, ref.outputIndex)} does not use this wallet's payment credential.`
        );
      }

      return utxo;
    })
  );
}

export function assertValidConsolidationLayout(
  walletInputs: UTxO[],
  canonicalWalletAddress: string,
  walletOutputCount: number
) {
  const migratesAddress = walletInputs.some(
    (walletInput) => walletInput.output.address !== canonicalWalletAddress
  );
  if (walletInputs.length < 2 && !migratesAddress) {
    throw new Error(
      "Consolidation needs at least two inputs unless one input is being migrated to the wallet's intended stake address."
    );
  }
  if (
    (!migratesAddress && walletOutputCount >= walletInputs.length) ||
    (migratesAddress && walletOutputCount > walletInputs.length)
  ) {
    throw new Error(
      migratesAddress
        ? "Wallet-address migration cannot increase the number of wallet script outputs."
        : "Consolidation must reduce the number of wallet script outputs."
    );
  }
  return { migratesAddress };
}

function sttQuantity(utxo: UTxO, sttUnit: string) {
  return utxo.output.amount.reduce(
    (quantity, asset) =>
      asset.unit === sttUnit ? quantity + BigInt(asset.quantity) : quantity,
    0n
  );
}

/**
 * Resolve the STT (state-thread) input among freshly-fetched script UTxOs. Prefers the explicit
 * `txHash#index` reference, but falls back to the single UTxO holding the STT asset when that
 * reference is stale, for example when a prior spend moved the STT to a new output and the cached
 * detected-token reference hasn't refreshed yet (chain-indexer lag). The STT is a unique NFT, so
 * exactly one UTxO at the script address can hold its unit; matching by asset is unambiguous and
 * self-heals a stale reference instead of failing the build with "UTxO not found".
 */
export function resolveSttInputUtxo(
  utxos: UTxO[],
  txHash: string,
  outputIndex: number | undefined,
  sttUnit: string
): UTxO {
  const exactReference =
    typeof outputIndex === "number"
      ? utxos.find(
          (utxo) =>
            utxo.input.txHash === txHash && utxo.input.outputIndex === outputIndex
        )
      : undefined;
  if (exactReference) {
    if (sttQuantity(exactReference, sttUnit) !== 1n) {
      throw new Error(
        `Configured STT input ${createInputRefKey(exactReference.input.txHash, exactReference.input.outputIndex)} must hold exactly one ${sttUnit}.`
      );
    }
    return exactReference;
  }

  if (typeof outputIndex !== "number") {
    const sameTransactionHoldingStt = utxos.filter(
      (utxo) =>
        utxo.input.txHash === txHash && sttQuantity(utxo, sttUnit) === 1n
    );
    if (sameTransactionHoldingStt.length === 1) {
      return sameTransactionHoldingStt[0]!;
    }
    if (sameTransactionHoldingStt.length > 1) {
      throw new Error(
        `Ambiguous STT input: ${sameTransactionHoldingStt.length} outputs from ${txHash} hold ${sttUnit}`
      );
    }
  }

  const holdingStt = utxos.filter((utxo) => sttQuantity(utxo, sttUnit) === 1n);
  if (holdingStt.length === 1) return holdingStt[0]!;
  if (holdingStt.length === 0) {
    throw new Error(
      `UTxO not found: ${txHash}${typeof outputIndex === "number" ? `#${outputIndex}` : ""}`
    );
  }
  // A unique NFT must live in exactly one UTxO; more than one signals malformed chain state.
  throw new Error(`Ambiguous STT input: ${holdingStt.length} UTxOs hold ${sttUnit}`);
}



export function ensureUniqueWalletInputRefs(
  refs: ConsolidateUtxosFormInput["walletInputs"]
) {
  const seen = new Set<string>();

  for (const ref of refs) {
    const key = `${ref.txHash}#${ref.outputIndex}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate wallet input reference: ${key}`);
    }

    seen.add(key);
  }
}
