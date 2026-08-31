"use client";
import { useTranslations } from "next-intl";


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
import { getUserFacingErrorMessage } from "@/lib/utils/errors";
import {
  DEMO_REWARD_ADDRESS,
  DEMO_WALLET_ADDRESS,
  DEMO_WALLET_INFO,
  createDemoWallet,
  withDemoWalletFallback
} from "@/lib/wallet/demo-wallet";
import {
  clearLastConnectedWalletName,
  persistLastConnectedWalletName,
  readLastConnectedWalletName
} from "@/lib/wallet/storage";
import { waitForCardanoInjection } from "@/lib/wallet/injection";

export { DEMO_WALLET_ID } from "@/providers/wallet.atoms";

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

/**
 * Who the extension is answering as RIGHT NOW. Read by both the connect path and the
 * focus refresh, so the two can never disagree about which address identifies the account.
 * A rejected address read is treated as "not this one" and falls through to the next
 * source; a rejected `getNetworkId` fails the whole read, leaving the caller to decide.
 */
async function readWalletIdentity(wallet: BrowserWallet) {
  const [usedAddresses, fallbackAddresses, changeAddress, rewards, networkId] = await Promise.all([
    wallet.getUsedAddresses().catch(() => []),
    wallet.getUnusedAddresses().catch(() => []),
    wallet.getChangeAddress().catch(() => null),
    wallet.getRewardAddresses().catch(() => []),
    wallet.getNetworkId()
  ]);

  return {
    address: usedAddresses[0] ?? fallbackAddresses[0] ?? changeAddress ?? null,
    rewardAddress: rewards[0] ?? null,
    networkId
  };
}

export function WalletProvider({ children }: PropsWithChildren) {
  const i18n = useTranslations("ProvidersWalletProvider");
  const [installedWallets, setInstalledWallets] = useState<Wallet[]>([]);
  // Wallet identity lives in atoms (single source of truth) so the workspace's derived-atom
  // graph can read it directly, with no context mirror and no sync lag. This provider is the sole writer.
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

  // Read through refs so the focus listener below can stay mounted once instead of
  // resubscribing on every identity change.
  const activeWalletRef = useRef<BrowserWallet | null>(null);
  const activeWalletNameRef = useRef<string | null>(null);
  useEffect(() => {
    activeWalletRef.current = activeWallet;
    activeWalletNameRef.current = activeWalletName;
  }, [activeWallet, activeWalletName]);

  // CIP-30 has no account-change event, and the injected api keeps answering for whichever
  // account the extension is on RIGHT NOW. The identity captured by connectWallet therefore
  // goes stale the moment the user switches account inside Eternl, while the transaction
  // builder keeps reading the live one: `setupTransaction` takes both its change address and
  // its required signer straight from the wallet. Two answers to "who is signing" left the
  // workspace showing the previous account's smart wallet and its permissions. Re-read on
  // focus, which is exactly when the user is coming back from the extension.
  const syncActiveAccount = useCallback(async () => {
    const wallet = activeWalletRef.current;
    if (!wallet || activeWalletNameRef.current === DEMO_WALLET_ID) {
      return;
    }

    try {
      const { address, rewardAddress, networkId: id } = await readWalletIdentity(wallet);
      // `activeWalletRef.current !== wallet`: a connect or disconnect landed while this read
      // was in flight, and that result is the newer one.
      if (!isMountedRef.current || !address || activeWalletRef.current !== wallet) {
        return;
      }

      // Before any setter, so a malformed address leaves the whole identity untouched
      // rather than half-updated.
      const paymentKeyHash = resolvePaymentKeyHash(address);
      setActiveAddress(address);
      setActiveRewardAddress(rewardAddress);
      setActivePaymentKeyHash(paymentKeyHash);
      setNetworkId(id);
    } catch {
      // Keep the last known identity. A failed read is not evidence that the account changed.
    }
  }, [setActiveAddress, setActivePaymentKeyHash, setActiveRewardAddress, setNetworkId]);

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
          i18n("walletNotAvailable", { walletName })
        );
      }

      // Keep the dapp approval prompt inside the original click gesture.
      const wallet = await withTimeout(
        BrowserWallet.enable(walletName),
        WALLET_ENABLE_TIMEOUT_MS,
        i18n("walletDidNotRespond", { walletName })
      );
      const { address, rewardAddress, networkId: id } = await readWalletIdentity(wallet);
      if (!address) {
        throw new Error(
          i18n("walletReturnedNoAddress", { walletName })
        );
      }

      if (!stillActive()) return;
      setActiveWallet(wallet);
      setActiveWalletName(walletName);
      setActiveAddress(address);
      setActiveRewardAddress(rewardAddress);
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
      const message = getUserFacingErrorMessage(
        error,
        i18n("couldNotConnectToWalletnameUnlockTheWallet", { walletName: walletName })
      );
      setConnectError(message);
      throw error;
    } finally {
      if (stillActive()) {
        setIsConnecting(false);
        setConnectingWalletName(null);
      }
    }
  }, [
    i18n,
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

    const refreshOnReturn = () => {
      void refreshWallets();
      void syncActiveAccount();
    };

    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") {
        refreshOnReturn();
      }
    };

    window.addEventListener("focus", refreshOnReturn);
    window.addEventListener(
      "cardano#initialized",
      refreshOnReturn as EventListener
    );
    document.addEventListener("visibilitychange", refreshOnVisible);

    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      window.removeEventListener(
        "cardano#initialized",
        refreshOnReturn as EventListener
      );
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [refreshWallets, syncActiveAccount]);

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
    // (no transient activation) and strand the UI in "connecting", the reported
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
