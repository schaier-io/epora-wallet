/** The browser RPC is served by the configured Preprod provider. */
export const CHAIN_NETWORK = "preprod" as const;

/** Initial freshness policy. Mutations invalidate changing chain data explicitly. */
export const queryPolicy = {
  chainStaleMs: 15_000,
  chainGcMs: 5 * 60_000,
  activePollMs: 30_000,
  metadataStaleMs: 60 * 60_000,
  metadataGcMs: 60 * 60_000,
  missingMetadataStaleMs: 60_000,
  protocolStaleMs: 5 * 60_000,
  helperStaleMs: 60_000,
  retryCount: 2,
  retryBaseMs: 1_000,
  retryMaxMs: 30_000
} as const;

const chain = ["chain", CHAIN_NETWORK] as const;
const signer = ["signer-utxos"] as const;

export const queryKeys = {
  chain,
  signer,
  addressUtxos: (address: string) => [...chain, "address-utxos", address] as const,
  txInfo: (hash: string) => [...chain, "transaction", hash] as const,
  accountInfo: (address: string) => [...chain, "account", address] as const,
  sttInventory: (policyId: string) => [...chain, "stt-inventory", policyId] as const,
  sttWallet: (policyId: string, unit: string) => [...chain, "stt-wallet", policyId, unit] as const,
  sharedReference: (policyId: string) => [...chain, "shared-reference", policyId] as const,
  protocolParameters: (epoch?: number) => [...chain, "protocol", epoch ?? "latest"] as const,
  assetIcon: (unit: string) => [...chain, "asset-metadata", unit, "icon"] as const,
  pool: (id: string) => [...chain, "pool", id] as const,
  sttCount: (policyId: string, network: string) => [...chain, "stt-count", network.toLowerCase(), policyId] as const,
  assetMetadata: (unit: string) => [...chain, "asset-metadata", unit] as const,
  signerUtxos: (network: number | null, walletName: string | null, address: string | null) =>
    [...signer, CHAIN_NETWORK, network, walletName, address] as const
};
