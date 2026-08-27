// Safe localStorage wrappers (SSR-guarded, never throw) plus the
// last-connected-wallet persistence helpers used by WalletProvider.

export const LAST_CONNECTED_WALLET_STORAGE_KEY = "permission-wallet:last-connected-wallet";

export function safeLocalStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalStorageSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore: storage may be disabled (private mode, quota, etc.)
  }
}

export function safeLocalStorageRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function readLastConnectedWalletName() {
  return safeLocalStorageGet(LAST_CONNECTED_WALLET_STORAGE_KEY);
}

export function persistLastConnectedWalletName(walletName: string) {
  safeLocalStorageSet(LAST_CONNECTED_WALLET_STORAGE_KEY, walletName);
}

export function clearLastConnectedWalletName() {
  safeLocalStorageRemove(LAST_CONNECTED_WALLET_STORAGE_KEY);
}
