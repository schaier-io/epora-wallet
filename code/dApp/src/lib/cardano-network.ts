// Single source of truth for the active Cardano network and the network-keyed
// external endpoints derived from it. Hoisting these off hardcoded "preprod"
// literals means a preview/mainnet switch is one constant change, not a hunt
// across formatters, explorer links, and proxy routes.

export type CardanoNetwork = "preprod" | "preview" | "mainnet";

export function parseCardanoNetwork(value: string | undefined): CardanoNetwork {
  const network = value?.trim() || "preprod";
  if (network !== "preprod" && network !== "preview" && network !== "mainnet") {
    throw new Error("NEXT_PUBLIC_CARDANO_NETWORK must be preprod, preview, or mainnet.");
  }
  return network;
}

// Next inlines this literal access for both browser and server during the build.
export const CARDANO_NETWORK = parseCardanoNetwork(process.env.NEXT_PUBLIC_CARDANO_NETWORK);

export function cardanoNetworkId(network: CardanoNetwork = CARDANO_NETWORK): 0 | 1 {
  return network === "mainnet" ? 1 : 0;
}

// The testnet faucet. It lives here for the reason the file exists: two places send a
// reader to it (the risk gate and `PreprodFaucetHint`), and a network switch has to move
// both at once. Only the test networks have one, so mainnet holds null.
const FAUCET_URLS: Record<CardanoNetwork, string | null> = {
  preprod: "https://docs.cardano.org/cardano-testnets/tools/faucet/",
  preview: "https://docs.cardano.org/cardano-testnets/tools/faucet/",
  mainnet: null
};

export function cardanoFaucetUrl(network: CardanoNetwork = CARDANO_NETWORK): string | null {
  return FAUCET_URLS[network];
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

// The explorers a reader browses to find a pool or a governance action id to paste. They
// point at mainnet on every network, because the test-network explorers list only test
// pools and actions, and GovTool has no preprod site. Off mainnet the screens say that a
// mainnet id finds nothing here.
export const POOL_EXPLORER_URLS = {
  cardanoscan: "https://cardanoscan.io/pools",
  adastat: "https://adastat.net/pools"
} as const;

export const GOVERNANCE_EXPLORER_URLS = {
  govtool: "https://gov.tools/governance_actions",
  cardanoscan: "https://cardanoscan.io/govActions"
} as const;
