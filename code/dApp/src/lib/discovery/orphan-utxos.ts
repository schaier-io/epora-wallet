// Pure helpers (no server-only imports) for classifying discovered wallet UTxOs
// into those at the intended/canonical address vs. "orphan" / Franken UTxOs at a
// different stake credential, and for feeding them into a wallet action.

import type { UTxO } from "@meshsdk/core";
import type { WalletInputRef } from "@/lib/types/contracts";
import type { DiscoveredUtxo } from "@/lib/discovery/types";

/// An orphan is any wallet-payment-credential UTxO whose FULL bech32 address
/// differs from the canonical wallet address (that is, a different or extra
/// stake credential than the State's `intended_stake_credential`). Comparing
/// full addresses needs no credential parsing: the canonical address already
/// encodes (payment credential, intended stake credential).
export function findOrphanUtxos(
  utxos: DiscoveredUtxo[],
  canonicalWalletAddress: string
): DiscoveredUtxo[] {
  return utxos.filter((utxo) => utxo.address !== canonicalWalletAddress);
}

export function sumLovelace(utxos: DiscoveredUtxo[]): bigint {
  return utxos.reduce((acc, utxo) => acc + safeBigInt(utxo.lovelace), 0n);
}

/// Aggregate native assets across a UTxO set into `unit -> quantity`.
export function sumAssets(utxos: DiscoveredUtxo[]): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const utxo of utxos) {
    for (const asset of utxo.assets) {
      totals.set(asset.unit, (totals.get(asset.unit) ?? 0n) + safeBigInt(asset.quantity));
    }
  }
  return totals;
}

/// Map orphans to the `walletInputs` shape consumed by `buildConsolidateUtxosTx`,
/// so a "move to your wallet address" action can spend them (matched on-chain by
/// payment credential) and return their value to the intended address.
export function orphanUtxosToWalletInputRefs(
  utxos: DiscoveredUtxo[]
): WalletInputRef[] {
  return utxos.map((utxo) => ({
    txHash: utxo.txHash,
    outputIndex: utxo.outputIndex
  }));
}

/// Load Koios-discovered outputs into the same fund-pool model as the canonical
/// address query. The transaction builder resolves every selected reference
/// again before spending it, so this model only supplies the selector and its
/// value preview.
export function mergeDiscoveredWalletUtxos(
  loaded: UTxO[],
  discovered: DiscoveredUtxo[]
): UTxO[] {
  const byReference = new Map(
    loaded.map((utxo) => [
      `${utxo.input.txHash}#${utxo.input.outputIndex}`,
      utxo
    ])
  );

  for (const utxo of discovered) {
    byReference.set(`${utxo.txHash}#${utxo.outputIndex}`, {
      input: { txHash: utxo.txHash, outputIndex: utxo.outputIndex },
      output: {
        address: utxo.address,
        amount: [
          { unit: "lovelace", quantity: utxo.lovelace },
          ...utxo.assets.map((asset) => ({ ...asset }))
        ]
      }
    } as UTxO);
  }

  return [...byReference.values()];
}

function safeBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}
