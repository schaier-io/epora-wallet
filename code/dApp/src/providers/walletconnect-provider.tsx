"use client";
import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { useTranslations } from "next-intl";


import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import type { SessionTypes } from "@walletconnect/types";
import {
  buildRequiredNamespaces,
  getSignClient,
  isWalletConnectConfigured,
  type CardanoNetwork
} from "@/lib/walletconnect/client";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";

type WalletConnectStatus =
  | "idle"
  | "connecting"
  | "awaiting-approval"
  | "expired"
  | "connected"
  | "error";

export type WalletConnectState = {
  status: WalletConnectStatus;
  uri: string | null;
  session: SessionTypes.Struct | null;
  error: string | null;
  network: CardanoNetwork;
  available: boolean;
};

type WalletConnectContextValue = WalletConnectState & {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setNetwork: (network: CardanoNetwork) => void;
};

const DEFAULT_STATE: WalletConnectState = {
  status: "idle",
  uri: null,
  session: null,
  error: null,
  network: CARDANO_NETWORK,
  available: false
};

// A session proposal lives for FIVE_MINUTES (300s) on the relay: `wc_sessionPropose.req.ttl`
// in `@walletconnect/sign-client`, value from `@walletconnect/time`. The library rejects the
// approval promise on that schedule too, but via timers that background-tab throttling can
// delay, so the provider arms its own deadline first and keeps the "expired" state
// deterministic regardless of when the library's rejection lands.
const PAIRING_EXPIRY_SECONDS = 300;
// The message sign-client rejects the approval promise with when the proposal expires. It
// can arrive as an Error (the promise's own timeout) or as a plain `{ message, code }`
// object (the expirer path), so it is matched by message, not by error type.
const SIGN_CLIENT_PROPOSAL_EXPIRED = "Proposal expired";

const WalletConnectContext = createContext<WalletConnectContextValue | null>(null);

export function WalletConnectProvider({ children }: PropsWithChildren) {
  const i18n = useTranslations("ProvidersWalletconnectProvider");
  const [state, setState] = useState<WalletConnectState>(() => ({
    ...DEFAULT_STATE,
    available: isWalletConnectConfigured()
  }));
  // Cancel or a newer connect bumps this; an older attempt then drops its result.
  const attemptRef = useRef(0);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback((next: Partial<WalletConnectState>) => {
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  const clearExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearExpiryTimer, [clearExpiryTimer]);

  // Restore any existing session on mount.
  useEffect(() => {
    if (!isWalletConnectConfigured()) return;

    let active = true;
    let eventClient: {
      off: (event: string, listener: (payload: { topic: string }) => void) => void;
    } | null = null;
    let sessionEventListener: ((payload: { topic: string }) => void) | null = null;

    const handleSessionDelete = ({ topic }: { topic: string }) => {
      setState((prev) =>
        prev.session?.topic === topic
          ? { ...prev, session: null, status: "idle", uri: null, error: null }
          : prev
      );
    };

    void (async () => {
      try {
        const client = await getSignClient();
        if (!active) return;
        const sessions = client.session.getAll();
        const restored = sessions[sessions.length - 1];
        if (restored) {
          patch({ session: restored, status: "connected" });
        }

        const events = client as unknown as {
          on: (event: string, listener: (payload: { topic: string }) => void) => void;
          off: (event: string, listener: (payload: { topic: string }) => void) => void;
        };
        const handleSessionEvent = ({ topic }: { topic: string }) => {
          setState((prev) => {
            if (prev.session?.topic !== topic) return prev;
            const updated = client.session.getAll().find((session) => session.topic === topic);
            return updated ? { ...prev, session: updated } : prev;
          });
        };
        eventClient = events;
        sessionEventListener = handleSessionEvent;
        events.on("session_delete", handleSessionDelete);
        events.on("session_event", handleSessionEvent);
        events.on("session_update", handleSessionEvent);
      } catch (err) {
        if (!active) return;
        patch({
          status: "error",
          error: getUserFacingErrorMessage(
            err,
            i18n("couldNotRestoreMobileWalletPairing")
          )
        });
      }
    })();

    return () => {
      active = false;
      eventClient?.off("session_delete", handleSessionDelete);
      if (sessionEventListener) {
        eventClient?.off("session_event", sessionEventListener);
        eventClient?.off("session_update", sessionEventListener);
      }
    };
  }, [i18n, patch]);

  const connect = useCallback(async () => {
    if (!isWalletConnectConfigured()) {
      patch({
        status: "error",
        error: i18n("mobileWalletPairingIsUnavailableInThisBuild")
      });
      return;
    }
    const attempt = (attemptRef.current += 1);
    const stillActive = () => attemptRef.current === attempt;
    clearExpiryTimer();
    patch({ status: "connecting", error: null, uri: null });
    try {
      const client = await getSignClient();
      // Client setup is async: the attempt may have been cancelled while it ran,
      // and opening a pairing for a dead attempt would leak a live URI nothing reaps.
      if (!stillActive()) return;
      const { uri, approval } = await client.connect({
        requiredNamespaces: buildRequiredNamespaces(state.network)
      });
      if (!stillActive()) {
        // Cancelled while the pairing was being opened: the phone may still approve,
        // so reap the session when it appears instead of leaking it.
        void approval()
          .then((session) =>
            client.disconnect({
              topic: session.topic,
              reason: { code: 6000, message: i18n("userDisconnected") }
            })
          )
          .catch(() => undefined);
        return;
      }
      if (uri) {
        patch({ uri, status: "awaiting-approval" });
      }
      expiryTimerRef.current = setTimeout(() => {
        if (!stillActive()) return;
        // The code is dead: it no longer pairs on the relay. Bumping the attempt sends
        // a later approval into the reaping branch below instead of the UI.
        attemptRef.current += 1;
        patch({ status: "expired", uri: null });
      }, PAIRING_EXPIRY_SECONDS * 1000);
      const session = await approval();
      if (!stillActive()) {
        // The phone approved after the user cancelled here: end that session.
        // The timer, if any, was already cleared or fired by whoever cancelled
        // this attempt, so a stale attempt must not touch it.
        void client
          .disconnect({ topic: session.topic, reason: { code: 6000, message: i18n("userDisconnected") } })
          .catch(() => undefined);
        return;
      }
      clearExpiryTimer();
      patch({ session, status: "connected", uri: null });
    } catch (err) {
      if (!stillActive()) return;
      clearExpiryTimer();
      // The rejection can be an Error or a plain `{ message, code }`; match by message.
      if ((err as { message?: unknown } | null)?.message === SIGN_CLIENT_PROPOSAL_EXPIRED) {
        // The library's expiry beat this timer (for example a throttled background tab);
        // same state either way.
        patch({ status: "expired", uri: null });
        return;
      }
      patch({
        status: "error",
        uri: null,
        error: getUserFacingErrorMessage(
          err,
          i18n("couldNotPairWithMobileWalletTryAgain")
        )
      });
    }
  }, [clearExpiryTimer, i18n, patch, state.network]);

  const disconnect = useCallback(async () => {
    attemptRef.current += 1;
    clearExpiryTimer();
    const current = state.session;
    if (!current) {
      patch({ status: "idle", uri: null, error: null });
      return;
    }
    try {
      const client = await getSignClient();
      await client.disconnect({
        topic: current.topic,
        reason: { code: 6000, message: i18n("userDisconnected") }
      });
    } catch (err) {
      const error = getUserFacingErrorMessage(
        err,
        i18n("couldNotDisconnectMobileWalletTryAgain")
      );
      setState((prev) =>
        prev.session?.topic === current.topic
          ? { ...prev, status: "connected", uri: null, error }
          : prev
      );
      return;
    }
    setState((prev) =>
      prev.session?.topic === current.topic
        ? { ...prev, status: "idle", session: null, uri: null, error: null }
        : prev
    );
  }, [clearExpiryTimer, i18n, patch, state.session]);

  const setNetwork = useCallback(
    (network: CardanoNetwork) => {
      patch({ network });
    },
    [patch]
  );

  return (
    <WalletConnectContext.Provider value={{ ...state, connect, disconnect, setNetwork }}>
      {children}
    </WalletConnectContext.Provider>
  );
}

export function useWalletConnect() {
  const ctx = useContext(WalletConnectContext);
  if (!ctx) {
    throw new Error("useWalletConnect must be used inside WalletConnectProvider.");
  }
  return ctx;
}
