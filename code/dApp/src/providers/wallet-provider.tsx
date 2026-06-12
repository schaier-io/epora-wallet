"use client";

import {
  BrowserWallet,
  resolvePaymentKeyHash,
  type Wallet
} from "@meshsdk/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  activeAddressAtom,
  activePaymentKeyHashAtom,
  activeRewardAddressAtom,
  activeWalletAtom,
  activeWalletNameAtom,
  DEMO_WALLET_ID,
  isDemoWalletAtom,
  networkIdAtom
} from "@/providers/wallet.atoms";

export { DEMO_WALLET_ID } from "@/providers/wallet.atoms";

const LAST_CONNECTED_WALLET_STORAGE_KEY = "permission-wallet:last-connected-wallet";
const CARDANO_INJECTION_WAIT_MS = 2_500;
const CARDANO_INJECTION_POLL_MS = 100;
const DEMO_WALLET_NAME = "Demo Wallet";
const DEMO_WALLET_ADDRESS =
  "addr_test1qpfakepermissionwalletdemoaddress000000000000000000000000000000000000";
const DEMO_REWARD_ADDRESS =
  "stake_test1upfakepermissionwalletdemoreward000000000000000000000000000";

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore — storage may be disabled (private mode, quota, etc.)
  }
}

function safeLocalStorageRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

const DEMO_WALLET_INFO = {
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

function createDemoWallet() {
  const readOnlyError = () =>
    new Error(
      "Demo wallet is read-only. Install and connect a CIP-30 wallet to build, sign, and submit transactions."
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

function withDemoWalletFallback(wallets: Wallet[], keepDemoAvailable: boolean) {
  if (!keepDemoAvailable && wallets.length > 0) {
    return wallets;
  }

  if (wallets.some((wallet) => wallet.id === DEMO_WALLET_ID)) {
    return wallets;
  }

  return [...wallets, DEMO_WALLET_INFO];
}

function readLastConnectedWalletName() {
  return safeLocalStorageGet(LAST_CONNECTED_WALLET_STORAGE_KEY);
}

function persistLastConnectedWalletName(walletName: string) {
  safeLocalStorageSet(LAST_CONNECTED_WALLET_STORAGE_KEY, walletName);
}

function clearLastConnectedWalletName() {
  safeLocalStorageRemove(LAST_CONNECTED_WALLET_STORAGE_KEY);
}

function hasCardanoInjection() {
  return typeof window !== "undefined" && typeof window.cardano !== "undefined";
}

async function waitForCardanoInjection(timeoutMs = CARDANO_INJECTION_WAIT_MS) {
  if (typeof window === "undefined" || hasCardanoInjection()) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve();
    };

    const checkForInjection = () => {
      if (hasCardanoInjection()) {
        finish();
      }
    };

    const onCardanoInitialized = () => {
      checkForInjection();
    };

    const intervalId = window.setInterval(checkForInjection, CARDANO_INJECTION_POLL_MS);
    const timeoutId = window.setTimeout(finish, timeoutMs);

    const cleanup = () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      window.removeEventListener("cardano#initialized", onCardanoInitialized as EventListener);
    };

    window.addEventListener(
      "cardano#initialized",
      onCardanoInitialized as EventListener,
      { once: true }
    );

    checkForInjection();
  });
}

type WalletContextType = {
  installedWallets: Wallet[];
  activeWallet: BrowserWallet | null;
  activeWalletName: string | null;
  isDemoWallet: boolean;
  connectingWalletName: string | null;
  activeAddress: string | null;
  activeRewardAddress: string | null;
  activePaymentKeyHash: string | null;
  isConnecting: boolean;
  networkId: number | null;
  connectError: string | null;
  clearConnectError: () => void;
  refreshWallets: () => Promise<void>;
  connectWallet: (walletName: string) => Promise<void>;
  cancelConnect: () => void;
  disconnectWallet: () => void;
};

const WalletContext = createContext<WalletContextType | null>(null);

// A misbehaving extension can leave `enable()` pending forever (the popup never
// opens, or the user walks away), which would strand the UI in "connecting".
// Cap the wait so the attempt fails cleanly and can be retried.
const WALLET_ENABLE_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function WalletProvider({ children }: PropsWithChildren) {
  const [installedWallets, setInstalledWallets] = useState<Wallet[]>([]);
  // Wallet identity lives in atoms (single source of truth) so the workspace's derived-atom
  // graph can read it directly — no context mirror, no sync lag. This provider is the sole writer.
  const [activeWallet, setActiveWallet] = useAtom(activeWalletAtom);
  const [activeWalletName, setActiveWalletName] = useAtom(activeWalletNameAtom);
  const [connectingWalletName, setConnectingWalletName] = useState<string | null>(null);
  const [activeAddress, setActiveAddress] = useAtom(activeAddressAtom);
  const [activeRewardAddress, setActiveRewardAddress] = useAtom(activeRewardAddressAtom);
  const [activePaymentKeyHash, setActivePaymentKeyHash] = useAtom(activePaymentKeyHashAtom);
  const [isConnecting, setIsConnecting] = useState(false);
  const [networkId, setNetworkId] = useAtom(networkIdAtom);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [walletsLoaded, setWalletsLoaded] = useState(false);
  const hasAttemptedAutoReconnect = useRef(false);
  const isMountedRef = useRef(true);
  // Bumped on every connect attempt and on cancel; lets an in-flight attempt
  // detect that it was superseded or cancelled and drop its result.
  const connectAttemptRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const clearConnectError = useCallback(() => setConnectError(null), []);

  const refreshWallets = useCallback(async () => {
    try {
      const wallets = await BrowserWallet.getAvailableWallets({
        injectFn: () => waitForCardanoInjection()
      });
      if (!isMountedRef.current) return;
      setInstalledWallets(
        withDemoWalletFallback(wallets, wallets.length === 0 || activeWalletName === DEMO_WALLET_ID)
      );
    } catch {
      if (!isMountedRef.current) return;
      setInstalledWallets([DEMO_WALLET_INFO]);
    } finally {
      if (isMountedRef.current) {
        setWalletsLoaded(true);
      }
    }
  }, [activeWalletName]);

  const connectWallet = useCallback(async (walletName: string) => {
    // Claim this attempt; if it gets cancelled (dialog closed) or superseded by
    // a newer attempt, `stillActive()` turns false and we drop the result.
    const attemptId = (connectAttemptRef.current += 1);
    const stillActive = () => isMountedRef.current && connectAttemptRef.current === attemptId;

    setIsConnecting(true);
    setConnectingWalletName(walletName);
    setConnectError(null);

    try {
      if (walletName === DEMO_WALLET_ID) {
        if (!stillActive()) return;
        setActiveWallet(createDemoWallet());
        setActiveWalletName(DEMO_WALLET_ID);
        setActiveAddress(DEMO_WALLET_ADDRESS);
        setActiveRewardAddress(DEMO_REWARD_ADDRESS);
        setNetworkId(0);
        setActivePaymentKeyHash(null);
        persistLastConnectedWalletName(DEMO_WALLET_ID);
        return;
      }

      if (typeof window !== "undefined" && !window.cardano?.[walletName]) {
        void refreshWallets();
        throw new Error(
          `${walletName} is not available in this browser tab yet. Refresh the wallet list and confirm the extension is enabled for this site.`
        );
      }

      // Keep the dapp approval prompt inside the original click gesture.
      const wallet = await withTimeout(
        BrowserWallet.enable(walletName),
        WALLET_ENABLE_TIMEOUT_MS,
        `${walletName} didn't respond. Make sure its popup opened and you approved the connection, then try again.`
      );
      const [usedAddresses, fallbackAddresses, changeAddress, rewards, id] = await Promise.all([
        wallet.getUsedAddresses().catch(() => []),
        wallet.getUnusedAddresses().catch(() => []),
        wallet.getChangeAddress().catch(() => null),
        wallet.getRewardAddresses().catch(() => []),
        wallet.getNetworkId()
      ]);
      const address = usedAddresses[0] ?? fallbackAddresses[0] ?? changeAddress ?? null;
      if (!address) {
        throw new Error(
          `${walletName} connected, but it did not return a usable address. Open an account in the wallet and try again.`
        );
      }

      if (!stillActive()) return;
      setActiveWallet(wallet);
      setActiveWalletName(walletName);
      setActiveAddress(address);
      setActiveRewardAddress(rewards[0] ?? null);
      setNetworkId(id);
      setActivePaymentKeyHash(address ? resolvePaymentKeyHash(address) : null);
      persistLastConnectedWalletName(walletName);
    } catch (error) {
      // A cancelled/superseded attempt shouldn't surface an error toast.
      if (!stillActive()) return;
      setActiveWallet(null);
      setActiveWalletName(null);
      setActiveAddress(null);
      setActiveRewardAddress(null);
      setActivePaymentKeyHash(null);
      setNetworkId(null);
      const message =
        error instanceof Error
          ? error.message
          : `Failed to connect to ${walletName}. The wallet may have rejected the connection.`;
      setConnectError(message);
      throw error;
    } finally {
      if (stillActive()) {
        setIsConnecting(false);
        setConnectingWalletName(null);
      }
    }
  }, [
    refreshWallets,
    setActiveWallet,
    setActiveWalletName,
    setActiveAddress,
    setActiveRewardAddress,
    setActivePaymentKeyHash,
    setNetworkId
  ]);

  const disconnectWallet = useCallback(() => {
    setActiveWallet(null);
    setActiveWalletName(null);
    setConnectingWalletName(null);
    setActiveAddress(null);
    setActiveRewardAddress(null);
    setActivePaymentKeyHash(null);
    setNetworkId(null);
    setConnectError(null);
    clearLastConnectedWalletName();
  }, [
    setActiveWallet,
    setActiveWalletName,
    setActiveAddress,
    setActiveRewardAddress,
    setActivePaymentKeyHash,
    setNetworkId
  ]);

  const cancelConnect = useCallback(() => {
    // Supersede any in-flight attempt (its result will be dropped) and return to
    // a clean idle state. Used when the connect dialog is closed mid-attempt.
    connectAttemptRef.current += 1;
    setIsConnecting(false);
    setConnectingWalletName(null);
    setConnectError(null);
  }, []);

  useEffect(() => {
    // Mount/identity-change loader for available wallets. refreshWallets awaits
    // the wallet injection before any setState, so it doesn't cascade renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshWallets();
  }, [refreshWallets]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refreshAvailableWallets = () => {
      void refreshWallets();
    };

    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") {
        refreshAvailableWallets();
      }
    };

    window.addEventListener("focus", refreshAvailableWallets);
    window.addEventListener(
      "cardano#initialized",
      refreshAvailableWallets as EventListener
    );
    document.addEventListener("visibilitychange", refreshOnVisible);

    return () => {
      window.removeEventListener("focus", refreshAvailableWallets);
      window.removeEventListener(
        "cardano#initialized",
        refreshAvailableWallets as EventListener
      );
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [refreshWallets]);

  useEffect(() => {
    if (hasAttemptedAutoReconnect.current || !walletsLoaded || activeWallet || isConnecting) {
      return;
    }

    const lastConnectedWalletName = readLastConnectedWalletName();
    if (!lastConnectedWalletName) {
      hasAttemptedAutoReconnect.current = true;
      return;
    }

    if (installedWallets.length === 0) {
      return;
    }

    const walletStillInstalled = installedWallets.some(
      (wallet) => wallet.id === lastConnectedWalletName
    );
    if (!walletStillInstalled) {
      const hasDetectedExtensionWallet = installedWallets.some(
        (wallet) => wallet.id !== DEMO_WALLET_ID
      );
      if (!hasDetectedExtensionWallet && lastConnectedWalletName !== DEMO_WALLET_ID) {
        return;
      }

      clearLastConnectedWalletName();
      hasAttemptedAutoReconnect.current = true;
      return;
    }

    hasAttemptedAutoReconnect.current = true;

    if (lastConnectedWalletName === DEMO_WALLET_ID) {
      // Silent auto-reconnect side-effect for the demo wallet.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void connectWallet(lastConnectedWalletName).catch(() => undefined);
      return;
    }

    // Only silently reconnect a real wallet that's ALREADY authorized. Calling
    // enable() outside a user gesture would block the extension's approval popup
    // (no transient activation) and strand the UI in "connecting" — the reported
    // "connection request not showing" hang. If it isn't authorized yet, wait
    // for the user's click, which carries the gesture the popup needs.
    void (async () => {
      try {
        const injected = (
          typeof window !== "undefined" ? window.cardano?.[lastConnectedWalletName] : undefined
        ) as { isEnabled?: () => Promise<boolean> } | undefined;
        const alreadyAuthorized = injected?.isEnabled
          ? await injected.isEnabled().catch(() => false)
          : false;
        if (alreadyAuthorized) {
          await connectWallet(lastConnectedWalletName);
        }
      } catch {
        // Stay disconnected; the user can reconnect with a click.
      }
    })();
  }, [activeWallet, connectWallet, installedWallets, isConnecting, walletsLoaded]);

  const isDemoWallet = useAtomValue(isDemoWalletAtom);

  const value = useMemo<WalletContextType>(
    () => ({
      installedWallets,
      activeWallet,
      activeWalletName,
      isDemoWallet,
      connectingWalletName,
      activeAddress,
      activeRewardAddress,
      activePaymentKeyHash,
      isConnecting,
      networkId,
      connectError,
      clearConnectError,
      refreshWallets,
      connectWallet,
      cancelConnect,
      disconnectWallet
    }),
    [
      installedWallets,
      activeWallet,
      activeWalletName,
      isDemoWallet,
      connectingWalletName,
      activeAddress,
      activeRewardAddress,
      activePaymentKeyHash,
      isConnecting,
      networkId,
      connectError,
      clearConnectError,
      refreshWallets,
      connectWallet,
      cancelConnect,
      disconnectWallet
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWalletContext() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWalletContext must be used inside WalletProvider.");
  }

  return context;
}
