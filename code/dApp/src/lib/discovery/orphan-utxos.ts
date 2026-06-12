// Pure helpers (no server-only imports) for classifying discovered wallet UTxOs
// into those at the intended/canonical address vs. "orphan" / Franken UTxOs at a
// different stake credential, and for feeding the orphans into the existing
// consolidation flow that sweeps them back to the intended address.

import type { WalletInputRef } from "@/lib/types/contracts";
import type { DiscoveredUtxo } from "@/lib/discovery/types";

/// An orphan is any wallet-payment-credential UTxO whose FULL bech32 address
/// differs from the canonical wallet address (i.e. a different — or extra —
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

function safeBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}
