// Read-only demo wallet shim: a fake CIP-30 BrowserWallet, its wallet-list entry,
// and the fallback that keeps the demo wallet offered when no extension wallet
// is installed (or the demo wallet is the active one).

import { type BrowserWallet, type Wallet } from "@meshsdk/core";
import { DEMO_WALLET_ID } from "@/providers/wallet.atoms";

const DEMO_WALLET_NAME = "Demo Wallet";
export const DEMO_WALLET_ADDRESS =
  "addr_test1qpfakepermissionwalletdemoaddress000000000000000000000000000000000000";
export const DEMO_REWARD_ADDRESS =
  "stake_test1upfakepermissionwalletdemoreward000000000000000000000000000";

export const DEMO_WALLET_INFO = {
  id: DEMO_WALLET_ID,
  name: DEMO_WALLET_NAME,
  icon: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="14" fill="#10243C" />
      <path d="M11 17.5C11 14.4624 13.4624 12 16.5 12H31.5C34.5376 12 37 14.4624 37 17.5V20H29.5C26.4624 20 24 22.4624 24 25.5C24 28.5376 26.4624 31 29.5 31H37V31.5C37 34.5376 34.5376 37 31.5 37H16.5C13.4624 37 11 34.5376 11 31.5V17.5Z" fill="#153D69" />
      <path d="M27 25.5C27 24.1193 28.1193 23 29.5 23H38V28H29.5C28.1193 28 27 26.8807 27 25.5Z" fill="#55D6BE" />
      <circle cx="31" cy="25.5" r="1.5" fill="#10243C" />
      <path d="M15 18H27" stroke="#8FE9DA" stroke-width="2.2" stroke-linecap="round" />
    </svg>`
  )}`
} as Wallet;

export function createDemoWallet() {
  const readOnlyError = () =>
    new Error(
      "Demo wallet is read-only. Install and connect a Cardano wallet to build, sign, and submit transactions."
    );

  return {
    getUsedAddresses: async () => [DEMO_WALLET_ADDRESS],
    getUnusedAddresses: async () => [DEMO_WALLET_ADDRESS],
    getChangeAddress: async () => DEMO_WALLET_ADDRESS,
    getRewardAddresses: async () => [DEMO_REWARD_ADDRESS],
    getNetworkId: async () => 0,
    getUtxos: async () => [],
    getCollateral: async () => [],
    signTx: async () => {
      throw readOnlyError();
    },
    submitTx: async () => {
      throw readOnlyError();
    }
  } as unknown as BrowserWallet;
}

export function withDemoWalletFallback(wallets: Wallet[], keepDemoAvailable: boolean) {
  if (!keepDemoAvailable && wallets.length > 0) {
    return wallets;
  }

  if (wallets.some((wallet) => wallet.id === DEMO_WALLET_ID)) {
    return wallets;
  }

  return [...wallets, DEMO_WALLET_INFO];
}
