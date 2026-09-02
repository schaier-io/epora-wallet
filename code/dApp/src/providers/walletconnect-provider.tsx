"use client";
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
  network: "preprod",
  available: false
};

const WalletConnectContext = createContext<WalletConnectContextValue | null>(null);

export function WalletConnectProvider({ children }: PropsWithChildren) {
  const i18n = useTranslations("ProvidersWalletconnectProvider");
  const [state, setState] = useState<WalletConnectState>(() => ({
    ...DEFAULT_STATE,
    available: isWalletConnectConfigured()
  }));
  const initRef = useRef(false);
  // Cancel or a newer connect bumps this; an older attempt then drops its result.
  const attemptRef = useRef(0);

  const patch = useCallback((next: Partial<WalletConnectState>) => {
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  // Restore any existing session on mount.
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (!isWalletConnectConfigured()) return;

    void (async () => {
      try {
        const client = await getSignClient();
        const sessions = client.session.getAll();
        const active = sessions[sessions.length - 1];
        if (active) {
          patch({ session: active, status: "connected" });
        }

        const events = (client as unknown as {
          on: (event: string, listener: (payload: { topic: string }) => void) => void;
        }).on.bind(client);
        events("session_delete", ({ topic }) => {
          setState((prev) =>
            prev.session?.topic === topic
              ? { ...prev, session: null, status: "idle", uri: null }
              : prev
          );
        });
        events("session_event", () => {
          const next = client.session.getAll();
          const latest = next[next.length - 1] ?? null;
          patch({ session: latest });
        });
      } catch (err) {
        patch({
          status: "error",
          error: getUserFacingErrorMessage(
            err,
            i18n("couldNotRestoreMobileWalletPairing")
          )
        });
      }
    })();
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
      const session = await approval();
      if (!stillActive()) {
        // The phone approved after the user cancelled here: end that session.
        void client
          .disconnect({ topic: session.topic, reason: { code: 6000, message: i18n("userDisconnected") } })
          .catch(() => undefined);
        return;
      }
      patch({ session, status: "connected", uri: null });
    } catch (err) {
      if (!stillActive()) return;
      patch({
        status: "error",
        uri: null,
        error: getUserFacingErrorMessage(
          err,
          i18n("couldNotPairWithMobileWalletTryAgain")
        )
      });
    }
  }, [i18n, patch, state.network]);

  const disconnect = useCallback(async () => {
    attemptRef.current += 1;
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
    } catch {
      // Treat best-effort disconnect failures as success locally.
    }
    patch({ status: "idle", session: null, uri: null, error: null });
  }, [i18n, patch, state.session]);

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
