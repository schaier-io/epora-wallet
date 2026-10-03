"use client";
import { isConnectingAtom } from "./wallet.atoms";
import { useTranslations } from "next-intl";
import { cardanoNetworkId } from "@/lib/cardano-network";


// Types only. `@meshsdk/core` bundles the whole Cardano serialisation stack: it built to a
// single 6.4 MB client chunk. This provider mounts in the root layout, so a value import
// here put that chunk on routes that never touch a wallet, the 404 shell included. The
// three places that need the runtime import it on demand, below.
import type { BrowserWallet, Wallet } from "@meshsdk/core";
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
import { useAtom, useAtomValue, useSetAtom } from "jotai";
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
import { rememberWalletAddressAtom } from "@/providers/wallet-address-book";
import { resolveWalletPaymentKeyHash } from "@/providers/wallet-payment-key-hash";
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
import { readWalletAuthorityAddress } from "@/lib/wallet/authority-address";
import { decideSavedDemoSessionRestore } from "@/lib/wallet/demo-session-restore";
import {
  hasCardanoInjection,
  waitForCardanoInjection,
  waitForCardanoWalletInjection
} from "@/lib/wallet/injection";

export { DEMO_WALLET_ID } from "@/providers/wallet.atoms";

type WalletContextType = {
  installedWallets: Wallet[];
  /** True once the first extension scan has settled, found wallets or not. */
  walletsLoaded: boolean;
  activeWallet: BrowserWallet | null;
  activeWalletName: string | null;
  isDemoWallet: boolean;
  connectingWalletName: string | null;
  activeAddress: string | null;
  activeRewardAddress: string | null;
  activePaymentKeyHash: string | null;
  isConnecting: boolean;
  /** True until the first saved-wallet restore decision has settled. */
  walletSessionLoading: boolean;
  networkId: number | null;
  connectError: string | null;
  clearConnectError: () => void;
  refreshWallets: () => Promise<void>;
  /** Resolves false when the attempt was cancelled or superseded before it finished. */
  connectWallet: (walletName: string) => Promise<boolean>;
  /**
   * The wallet the provider reconnected on its own after a reload, while it is the
   * active one. Null once the person connects a wallet themselves.
   */
  restoredWalletName: string | null;
  cancelConnect: () => void;
  disconnectWallet: () => void;
};

const WalletContext = createContext<WalletContextType | null>(null);

// Bound extension authorization, enable, and identity reads so a stalled response
// cannot strand session restoration or connection in its loading state.
const WALLET_RESPONSE_TIMEOUT_MS = 90_000;

function importWalletRuntime() {
  return import("@meshsdk/core");
}

let walletRuntimePromise: ReturnType<typeof importWalletRuntime> | null = null;

function loadWalletRuntime() {
  const pending = walletRuntimePromise ?? importWalletRuntime();
  walletRuntimePromise = pending;
  return pending.catch((error) => {
    if (walletRuntimePromise === pending) {
      walletRuntimePromise = null;
    }
    throw error;
  });
}

// A message this file wrote for the user; it must not be re-mapped by the
// generic error classifier, which reads "did not respond" as a network fault.
class KnownConnectError extends Error {}

// CIP-30 APIErrorCode.AccountChange.
const CIP30_ACCOUNT_CHANGE_CODE = -4;

function isCip30AccountChange(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === CIP30_ACCOUNT_CHANGE_CODE
  );
}

function sameWalletList(current: Wallet[], next: Wallet[]) {
  return (
    current.length === next.length &&
    current.every((wallet, index) => {
      const candidate = next[index];
      return (
        candidate !== undefined &&
        wallet.id === candidate.id &&
        wallet.name === candidate.name &&
        wallet.icon === candidate.icon &&
        wallet.version === candidate.version
      );
    })
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new KnownConnectError(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Who the extension is answering as RIGHT NOW. Read by both the connect path and the
 * focus refresh, so the two can never disagree about which address identifies the account.
 * Identity read failures propagate, so an account change cannot select another key.
 */
async function readWalletIdentity(wallet: BrowserWallet) {
  const [address, rewards, networkId] = await Promise.all([
    readWalletAuthorityAddress(wallet),
    wallet.getRewardAddresses().catch(() => []),
    wallet.getNetworkId()
  ]);

  return {
    address,
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
  const [isConnecting, setIsConnecting] = useAtom(isConnectingAtom);
  const [walletSessionLoading, setWalletSessionLoading] = useState(true);
  const [networkId, setNetworkId] = useAtom(networkIdAtom);
  const [connectError, setConnectError] = useState<string | null>(null);
  const connectErrorSourceRef = useRef<"connect" | "focus" | null>(null);
  const [walletsLoaded, setWalletsLoaded] = useState(false);
  const hasAttemptedAutoReconnect = useRef(false);
  const isMountedRef = useRef(true);
  // Bumped on every connect attempt and on cancel; lets an in-flight attempt
  // detect that it was superseded or cancelled and drop its result.
  const connectAttemptRef = useRef(0);
  const walletScanGenerationRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // The address book maps a person's stored wallet id (payment key hash) back to the
  // address the reader recognises. The provider sees every identity this app ever
  // connects to — connect, account switch on focus, demo — so learn each pair here
  // once, and every wallet field in the app can name it from then on.
  const rememberWalletAddress = useSetAtom(rememberWalletAddressAtom);
  useEffect(() => {
    if (activeAddress) {
      rememberWalletAddress(activeAddress);
    }
  }, [activeAddress, rememberWalletAddress]);

  const clearConnectError = useCallback(() => {
    connectErrorSourceRef.current = null;
    setConnectError(null);
  }, []);

  // Read through refs so the focus listener below can stay mounted once instead of
  // resubscribing on every identity change.
  const activeWalletRef = useRef<BrowserWallet | null>(null);
  const activeWalletNameRef = useRef<string | null>(null);
  const accountSyncGenerationRef = useRef(0);
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
    const generation = (accountSyncGenerationRef.current += 1);

    try {
      const { address, rewardAddress, networkId: id } = await withTimeout(
        readWalletIdentity(wallet), WALLET_RESPONSE_TIMEOUT_MS,
        i18n("walletDidNotRespond", { walletName: activeWalletNameRef.current ?? "" })
      );
      // `activeWalletRef.current !== wallet`: a connect or disconnect landed while this read
      // was in flight, and that result is the newer one.
      if (
        !isMountedRef.current ||
        !address ||
        activeWalletRef.current !== wallet ||
        accountSyncGenerationRef.current !== generation
      ) {
        return;
      }

      // Before any setter, so a malformed address leaves the whole identity untouched
      // rather than half-updated.
      const paymentKeyHash = await resolveWalletPaymentKeyHash(address);
      if (
        !isMountedRef.current ||
        !address ||
        activeWalletRef.current !== wallet ||
        accountSyncGenerationRef.current !== generation
      ) {
        return;
      }
      setActiveAddress(address);
      setActiveRewardAddress(rewardAddress);
      setActivePaymentKeyHash(paymentKeyHash);
      setNetworkId(id);
      if (connectErrorSourceRef.current === "focus") {
        connectErrorSourceRef.current = null;
        setConnectError(null);
      }
    } catch (error) {
      if (isMountedRef.current && activeWalletRef.current === wallet && accountSyncGenerationRef.current === generation && connectErrorSourceRef.current !== "connect") {
        connectErrorSourceRef.current = "focus";
        setConnectError(error instanceof KnownConnectError ? error.message :
          getUserFacingErrorMessage(error, i18n("couldNotConnectToWalletnameUnlockTheWallet", { walletName: activeWalletNameRef.current ?? "" })));
      }
      // Keep the last known identity. A failed read is not evidence that the account changed,
      // except CIP-30 APIError AccountChange (-4): that api object is dead, and the caller
      // must enable the wallet again.
      if (
        isCip30AccountChange(error) &&
        isMountedRef.current &&
        activeWalletRef.current === wallet &&
        accountSyncGenerationRef.current === generation
      ) {
        return "account-changed" as const;
      }
    }
  }, [i18n, setActiveAddress, setActivePaymentKeyHash, setActiveRewardAddress, setNetworkId]);

  const refreshWallets = useCallback(async () => {
    const generation = (walletScanGenerationRef.current += 1);
    const isLatest = () =>
      isMountedRef.current && walletScanGenerationRef.current === generation;
    const updateInstalledWallets = (next: Wallet[]) => {
      setInstalledWallets((current) => (sameWalletList(current, next) ? current : next));
    };

    try {
      await waitForCardanoInjection();
      // No `window.cardano` after the wait means no CIP-30 extension answered, so the list
      // is empty and there is nothing for the SDK to enumerate. Returning here is what
      // keeps the Cardano stack off a visit from a browser with no wallet installed, which
      // is the whole point of the lazy import: the mount scan runs on every route.
      if (!hasCardanoInjection()) {
        if (!isLatest()) return;
        updateInstalledWallets(withDemoWalletFallback([], true));
        return;
      }
      const { BrowserWallet } = await loadWalletRuntime();
      const wallets = await BrowserWallet.getAvailableWallets({
        injectFn: () => waitForCardanoInjection()
      });
      if (!isLatest()) return;
      updateInstalledWallets(
        withDemoWalletFallback(
          wallets,
          wallets.length === 0 || activeWalletNameRef.current === DEMO_WALLET_ID
        )
      );
    } catch {
      if (!isLatest()) return;
      updateInstalledWallets([DEMO_WALLET_INFO]);
    } finally {
      if (isLatest()) {
        setWalletsLoaded(true);
      }
    }
  }, []);

  const [restoredWalletName, setRestoredWalletName] = useState<string | null>(null);

  // `restore` marks the silent reconnect after a reload. The flag rides with the
  // attempt, so a click that supersedes the restore is announced as the person's own.
  const connect = useCallback(async (walletName: string, restore: boolean): Promise<boolean> => {
    // Claim this attempt; if it gets cancelled (dialog closed) or superseded by
    // a newer attempt, `stillActive()` turns false and we drop the result.
    const attemptId = (connectAttemptRef.current += 1);
    accountSyncGenerationRef.current += 1;
    const stillActive = () => isMountedRef.current && connectAttemptRef.current === attemptId;
    const hadActiveWallet = activeWalletRef.current !== null;

    setIsConnecting(true);
    setConnectingWalletName(walletName);
    connectErrorSourceRef.current = null;
    setConnectError(null);

    try {
      if (walletName === DEMO_WALLET_ID) {
        if (!stillActive()) return false;
        const wallet = createDemoWallet();
        accountSyncGenerationRef.current += 1;
        activeWalletRef.current = wallet;
        activeWalletNameRef.current = DEMO_WALLET_ID;
        clearConnectError();
        setActiveWallet(wallet);
        setActiveWalletName(DEMO_WALLET_ID);
        setActiveAddress(DEMO_WALLET_ADDRESS);
        setActiveRewardAddress(DEMO_REWARD_ADDRESS);
        setNetworkId(cardanoNetworkId());
        setActivePaymentKeyHash(null);
        setRestoredWalletName(restore ? DEMO_WALLET_ID : null);
        persistLastConnectedWalletName(DEMO_WALLET_ID);
        return true;
      }

      if (typeof window !== "undefined" && !window.cardano?.[walletName]) {
        void refreshWallets();
        throw new KnownConnectError(i18n("walletNotAvailable", { walletName }));
      }

      // The direct restore and wallet inventory scan share one runtime import. The restore
      // does not wait for inventory enumeration, and a later manual connect uses the cache.
      const { BrowserWallet, resolvePaymentKeyHash } = await loadWalletRuntime();
      // Keep the dapp approval prompt inside the original click gesture.
      const wallet = await withTimeout(
        BrowserWallet.enable(walletName),
        WALLET_RESPONSE_TIMEOUT_MS,
        i18n("walletDidNotRespond", { walletName })
      );
      if (!stillActive()) return false;
      const { address, rewardAddress, networkId: id } = await withTimeout(
        readWalletIdentity(wallet),
        WALLET_RESPONSE_TIMEOUT_MS,
        i18n("walletDidNotRespond", { walletName })
      );
      if (!address) {
        throw new KnownConnectError(i18n("walletReturnedNoAddress", { walletName }));
      }
      const paymentKeyHash = resolvePaymentKeyHash(address);

      if (!stillActive()) return false;
      accountSyncGenerationRef.current += 1;
      activeWalletRef.current = wallet;
      activeWalletNameRef.current = walletName;
      clearConnectError();
      setActiveWallet(wallet);
      setActiveWalletName(walletName);
      setActiveAddress(address);
      setActiveRewardAddress(rewardAddress);
      setNetworkId(id);
      setActivePaymentKeyHash(paymentKeyHash);
      setRestoredWalletName(restore ? walletName : null);
      persistLastConnectedWalletName(walletName);
      return true;
    } catch (error) {
      // A cancelled/superseded attempt shouldn't surface an error toast.
      if (!stillActive()) return false;
      if (restore || !hadActiveWallet) {
        setActiveWallet(null);
        setActiveWalletName(null);
        setActiveAddress(null);
        setActiveRewardAddress(null);
        setActivePaymentKeyHash(null);
        setNetworkId(null);
      }
      const message =
        error instanceof KnownConnectError
          ? error.message
          : getUserFacingErrorMessage(
              error,
              i18n("couldNotConnectToWalletnameUnlockTheWallet", { walletName: walletName })
            );
      connectErrorSourceRef.current = "connect";
      setConnectError(message);
      throw error;
    } finally {
      if (stillActive()) {
        setIsConnecting(false);
        setConnectingWalletName(null);
        setWalletSessionLoading(false);
      }
    }
  }, [
    clearConnectError,
    i18n,
    refreshWallets,
    setActiveWallet,
    setActiveWalletName,
    setActiveAddress,
    setActiveRewardAddress,
    setActivePaymentKeyHash,
    setNetworkId,
    setIsConnecting
  ]);
  const connectWallet = useCallback((walletName: string) => connect(walletName, false), [connect]);

  const disconnectWallet = useCallback(() => {
    connectAttemptRef.current += 1;
    accountSyncGenerationRef.current += 1;
    activeWalletRef.current = null;
    activeWalletNameRef.current = null;
    setActiveWallet(null);
    setActiveWalletName(null);
    setIsConnecting(false);
    setConnectingWalletName(null);
    setActiveAddress(null);
    setActiveRewardAddress(null);
    setActivePaymentKeyHash(null);
    setNetworkId(null);
    connectErrorSourceRef.current = null;
    setConnectError(null);
    setWalletSessionLoading(false);
    clearLastConnectedWalletName();
  }, [
    setActiveWallet,
    setActiveWalletName,
    setActiveAddress,
    setActiveRewardAddress,
    setActivePaymentKeyHash,
    setNetworkId,
    setIsConnecting
  ]);

  const cancelConnect = useCallback(() => {
    // Supersede any in-flight attempt (its result will be dropped) and return to
    // a clean idle state. Used when the connect dialog is closed mid-attempt.
    connectAttemptRef.current += 1;
    setIsConnecting(false);
    setConnectingWalletName(null);
    connectErrorSourceRef.current = null;
    setConnectError(null);
    setWalletSessionLoading(false);
  }, [setIsConnecting]);

  useEffect(() => {
    // Load available wallets once on mount. Focus and injection events refresh the list below.
    void refreshWallets();
  }, [refreshWallets]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refreshOnReturn = () => {
      const attemptBeforeCheck = connectAttemptRef.current;
      void refreshWallets();
      void syncActiveAccount().then(async (result) => {
        const walletName = activeWalletNameRef.current;
        if (result !== "account-changed" || !walletName) return;
        const accountGeneration = accountSyncGenerationRef.current;
        // Same rule as the restore after a reload: enable() outside a user gesture can hang
        // on an approval popup nobody asked for. Re-enable silently only when the new
        // account already authorized this site; otherwise drop the stale identity and wait
        // for a click. A failed re-enable clears the identity and names the error.
        const injected = window.cardano?.[walletName] as
          | { isEnabled?: () => Promise<boolean> }
          | undefined;
        const authorized = injected?.isEnabled
          ? await injected.isEnabled().catch(() => false)
          : false;
        if (!isMountedRef.current || activeWalletNameRef.current !== walletName ||
          connectAttemptRef.current !== attemptBeforeCheck ||
          accountSyncGenerationRef.current !== accountGeneration) return;
        if (!authorized) {
          disconnectWallet();
          return;
        }
        connect(walletName, true).catch(() => {});
      });
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
  }, [connect, disconnectWallet, refreshWallets, syncActiveAccount]);

  useEffect(() => {
    if (activeWallet) {
      return;
    }

    if (hasAttemptedAutoReconnect.current || isConnecting) {
      return;
    }

    const lastConnectedWalletName = readLastConnectedWalletName();
    if (!lastConnectedWalletName) {
      hasAttemptedAutoReconnect.current = true;
      queueMicrotask(() => {
        if (isMountedRef.current) setWalletSessionLoading(false);
      });
      return;
    }

    if (lastConnectedWalletName === DEMO_WALLET_ID) {
      const decision = decideSavedDemoSessionRestore({
        walletsLoaded,
        demoWalletDiscovered: installedWallets.some((wallet) => wallet.id === DEMO_WALLET_ID)
      });
      if (decision === "wait") {
        return;
      }
      hasAttemptedAutoReconnect.current = true;
      if (decision === "abandon") {
        // Discovery settled and keeps the demo wallet hidden while a real extension is
        // installed, so this saved session can never restore. Settle the loading flag
        // instead of waiting forever; the user picks from the wallets that do exist.
        queueMicrotask(() => {
          if (isMountedRef.current) setWalletSessionLoading(false);
        });
        return;
      }
      // Silent auto-reconnect side-effect for the demo wallet.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void connect(lastConnectedWalletName, true).catch(() => undefined);
      return;
    }

    // Restore the saved extension directly while the full wallet inventory loads
    // in parallel. Only silently reconnect a real wallet that's ALREADY authorized. Calling
    // enable() outside a user gesture would block the extension's approval popup
    // (no transient activation) and strand the UI in "connecting", the reported
    // "connection request not showing" hang. If it isn't authorized yet, wait
    // for the user's click, which carries the gesture the popup needs.
    // A click that lands while `isEnabled()` is still pending outranks the restore:
    // starting the restore afterwards would supersede the person's own attempt and
    // hide the result behind the silent-restore mark.
    hasAttemptedAutoReconnect.current = true;
    const attemptBeforeCheck = connectAttemptRef.current;
    void (async () => {
      try {
        await waitForCardanoWalletInjection(lastConnectedWalletName);
        const injected = (
          typeof window !== "undefined" ? window.cardano?.[lastConnectedWalletName] : undefined
        ) as { isEnabled?: () => Promise<boolean> } | undefined;
        if (!injected) {
          hasAttemptedAutoReconnect.current = false;
          return;
        }
        const alreadyAuthorized = injected?.isEnabled
          ? await withTimeout(
              injected.isEnabled(),
              WALLET_RESPONSE_TIMEOUT_MS,
              i18n("walletDidNotRespond", { walletName: lastConnectedWalletName })
            ).catch(() => false)
          : false;
        if (alreadyAuthorized && isMountedRef.current && connectAttemptRef.current === attemptBeforeCheck) {
          await connect(lastConnectedWalletName, true);
        }
      } catch {
        // Stay disconnected; the user can reconnect with a click.
      } finally {
        if (isMountedRef.current && connectAttemptRef.current === attemptBeforeCheck) {
          setWalletSessionLoading(false);
        }
      }
    })();
  }, [activeWallet, connect, i18n, installedWallets, isConnecting, walletsLoaded]);

  const isDemoWallet = useAtomValue(isDemoWalletAtom);

  const value = useMemo<WalletContextType>(
    () => ({
      installedWallets,
      walletsLoaded,
      activeWallet,
      activeWalletName,
      isDemoWallet,
      connectingWalletName,
      activeAddress,
      activeRewardAddress,
      activePaymentKeyHash,
      isConnecting,
      walletSessionLoading: walletSessionLoading && !activeWallet,
      networkId,
      connectError,
      clearConnectError,
      refreshWallets,
      connectWallet,
      restoredWalletName,
      cancelConnect,
      disconnectWallet
    }),
    [
      installedWallets,
      walletsLoaded,
      activeWallet,
      activeWalletName,
      isDemoWallet,
      connectingWalletName,
      activeAddress,
      activeRewardAddress,
      activePaymentKeyHash,
      isConnecting,
      walletSessionLoading,
      networkId,
      connectError,
      clearConnectError,
      refreshWallets,
      connectWallet,
      restoredWalletName,
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
