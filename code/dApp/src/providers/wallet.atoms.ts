"use client";

import { atom, type PrimitiveAtom } from "jotai";
import type { BrowserWallet } from "@meshsdk/core";

/**
 * The connected-wallet identity state, held as atoms so it has a SINGLE source of truth that both
 * `useWalletContext` and the workspace's derived-atom graph read directly, with no React-context mirror,
 * no sync effect, no one-render lag. `WalletProvider` is the sole writer (it sets these on
 * connect/disconnect); everyone else reads via `useAtomValue` / `useWalletContext`.
 */
export const DEMO_WALLET_ID = "__permission_wallet_demo__";

const accountRevisionAtom = atom(0);
/** Returning to an account starts a new SDK read, even while its old cache is fresh. */
export const walletAccountRevisionAtom = atom(get => get(accountRevisionAtom));

function accountIdentityAtom<Value>(initialValue: Value): PrimitiveAtom<Value> {
  const valueAtom = atom(initialValue);
  return atom(get => get(valueAtom), (get, set, next: Value | ((previous: Value) => Value)) => {
    const previous = get(valueAtom);
    const value = typeof next === "function" ? (next as (previous: Value) => Value)(previous) : next;
    if (Object.is(previous, value)) return;
    set(valueAtom, value);
    set(accountRevisionAtom, revision => revision + 1);
  });
}

export const activeWalletAtom = accountIdentityAtom<BrowserWallet | null>(null);
export const activeWalletNameAtom = accountIdentityAtom<string | null>(null);
export const activeAddressAtom = accountIdentityAtom<string | null>(null);
export const activeRewardAddressAtom = atom<string | null>(null);
export const activePaymentKeyHashAtom = atom<string | null>(null);
export const isConnectingAtom = atom(false);
export const networkIdAtom = accountIdentityAtom<number | null>(null);

/** Derived: the active wallet is the read-only demo wallet. */
export const isDemoWalletAtom = atom((get) => get(activeWalletNameAtom) === DEMO_WALLET_ID);
/** Derived: a usable Preprod wallet is connected. */
export const walletReadyAtom = atom(
  (get) => Boolean(get(activeWalletAtom) && get(networkIdAtom) === 0)
);

/** Public chain discovery starts while a connection is in progress. */
export const chainReadsEnabledAtom = atom(get => get(isConnectingAtom) || get(walletReadyAtom));
