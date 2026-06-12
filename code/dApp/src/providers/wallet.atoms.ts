"use client";

import { atom } from "jotai";
import type { BrowserWallet } from "@meshsdk/core";

/**
 * The connected-wallet identity state, held as atoms so it has a SINGLE source of truth that both
 * `useWalletContext` and the workspace's derived-atom graph read directly — no React-context mirror,
 * no sync effect, no one-render lag. `WalletProvider` is the sole writer (it sets these on
 * connect/disconnect); everyone else reads via `useAtomValue` / `useWalletContext`.
 */
export const DEMO_WALLET_ID = "__permission_wallet_demo__";

export const activeWalletAtom = atom<BrowserWallet | null>(null);
export const activeWalletNameAtom = atom<string | null>(null);
export const activeAddressAtom = atom<string | null>(null);
export const activeRewardAddressAtom = atom<string | null>(null);
export const activePaymentKeyHashAtom = atom<string | null>(null);
export const networkIdAtom = atom<number | null>(null);

/** Derived: the active wallet is the read-only demo wallet. */
export const isDemoWalletAtom = atom((get) => get(activeWalletNameAtom) === DEMO_WALLET_ID);
/** Derived: a usable Preprod wallet is connected. */
export const walletReadyAtom = atom(
  (get) => Boolean(get(activeWalletAtom) && get(networkIdAtom) === 0)
);
