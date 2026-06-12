// Shared types for wallet-UTxO discovery by PAYMENT credential (orphan /
// "Franken" detection). Kept free of any server-only imports so both the server
// Koios client and the client-side classifier/hook can use them.

type DiscoveredAsset = {
  /// `policyId + assetNameHex` (empty string for lovelace is represented via
  /// the separate `lovelace` field, so this list holds only native assets).
  unit: string;
  quantity: string;
};

export type DiscoveredUtxo = {
  txHash: string;
  outputIndex: number;
  /// Full bech32 address (payment + stake). Two UTxOs at the same wallet payment
  /// credential but different stake credentials have DIFFERENT `address` values.
  address: string;
  lovelace: string;
  assets: DiscoveredAsset[];
};

export type OrphanUtxosResponse = {
  utxos: DiscoveredUtxo[];
};
