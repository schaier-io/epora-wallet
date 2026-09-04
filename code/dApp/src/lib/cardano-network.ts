// Single source of truth for the active Cardano network and the network-keyed
// external endpoints derived from it. Hoisting these off hardcoded "preprod"
// literals means a preview/mainnet switch is one constant change, not a hunt
// across formatters, explorer links, and proxy routes.

export type CardanoNetwork = "preprod" | "preview" | "mainnet";

export const CARDANO_NETWORK: CardanoNetwork = "preprod";

export function cardanoNetworkId(network: CardanoNetwork = CARDANO_NETWORK): 0 | 1 {
  return network === "mainnet" ? 1 : 0;
}

const CARDANOSCAN_HOSTS: Record<CardanoNetwork, string> = {
  preprod: "https://preprod.cardanoscan.io",
  preview: "https://preview.cardanoscan.io",
  mainnet: "https://cardanoscan.io"
};

export function cardanoscanTransactionUrl(
  hash: string,
  network: CardanoNetwork = CARDANO_NETWORK
): string {
  return `${CARDANOSCAN_HOSTS[network]}/transaction/${hash}`;
}

export function cardanoscanAddressUrl(
  address: string,
  network: CardanoNetwork = CARDANO_NETWORK
): string {
  return `${CARDANOSCAN_HOSTS[network]}/address/${address}`;
}
