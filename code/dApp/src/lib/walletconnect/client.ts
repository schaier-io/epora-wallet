"use client";

import type { ISignClient } from "@walletconnect/types";
import { SITE_URL, WALLETCONNECT_PROJECT_ID } from "@/lib/env/client-env";

const WC_RELAY_URL = "wss://relay.walletconnect.com";

/**
 * What a phone wallet shows in its CIP-45 pairing prompt.
 *
 * This is the only thing a person sees before approving a connection from another device, so
 * it has to be recognisably this product. It used to read "Smart Wallet" at
 * `https://smartwallet.local` with a raw GitHub avatar for an icon: a generic name, a domain
 * that does not resolve, and unbranded art. That is the silhouette of a phishing prompt, and
 * it asked people to tell it apart from one on nothing but trust.
 *
 * The icon is served from this deployment rather than a third-party host, so the prompt shows
 * the same mark as the site the pairing came from.
 */
const APP_ORIGIN = typeof window === "undefined" ? SITE_URL : window.location.origin;

const APP_METADATA = {
  name: "Epora Wallet",
  description: "Shared Cardano wallet with key recovery",
  url: APP_ORIGIN,
  icons: [`${APP_ORIGIN}/icon.svg`]
};

/**
 * Cardano namespace per CIP-45.
 * Chain IDs:
 *   - cip34:1-764824073  → Cardano mainnet
 *   - cip34:0-1          → Cardano preprod testnet
 *   - cip34:0-2          → Cardano preview testnet
 */
const CARDANO_NAMESPACE = "cip34" as const;
const CARDANO_CHAIN_PREPROD = `${CARDANO_NAMESPACE}:0-1` as const;
const CARDANO_CHAIN_MAINNET = `${CARDANO_NAMESPACE}:1-764824073` as const;

const CARDANO_METHODS = [
  "cardano_signTx",
  "cardano_signData",
  "cardano_submitTx",
  "cardano_getNetworkId",
  "cardano_getUsedAddresses",
  "cardano_getUnusedAddresses",
  "cardano_getChangeAddress",
  "cardano_getRewardAddresses",
  "cardano_getBalance",
  "cardano_getUtxos",
  "cardano_getCollateral"
] as const;

const CARDANO_EVENTS = ["accountChanged", "networkChanged"] as const;

let clientPromise: Promise<ISignClient> | null = null;

function getWalletConnectProjectId(): string {
  if (!WALLETCONNECT_PROJECT_ID) {
    throw new Error(
      "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. Get one at https://cloud.reown.com and add it to .env.local."
    );
  }
  return WALLETCONNECT_PROJECT_ID;
}

export function isWalletConnectConfigured(): boolean {
  return Boolean(WALLETCONNECT_PROJECT_ID);
}

export async function getSignClient(): Promise<ISignClient> {
  if (typeof window === "undefined") {
    throw new Error("WalletConnect SignClient can only run in the browser.");
  }
  if (clientPromise) {
    return clientPromise;
  }
  clientPromise = (async () => {
    const { SignClient } = await import("@walletconnect/sign-client");
    return SignClient.init({
      projectId: getWalletConnectProjectId(),
      relayUrl: WC_RELAY_URL,
      metadata: APP_METADATA
    });
  })();
  return clientPromise;
}

export type CardanoNetwork = "mainnet" | "preprod" | "preview";

function chainForNetwork(network: CardanoNetwork): string {
  switch (network) {
    case "mainnet":
      return CARDANO_CHAIN_MAINNET;
    case "preview":
      return `${CARDANO_NAMESPACE}:0-2`;
    case "preprod":
    default:
      return CARDANO_CHAIN_PREPROD;
  }
}

export function buildRequiredNamespaces(network: CardanoNetwork) {
  return {
    [CARDANO_NAMESPACE]: {
      chains: [chainForNetwork(network)],
      methods: [...CARDANO_METHODS],
      events: [...CARDANO_EVENTS]
    }
  };
}
