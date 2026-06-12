"use client";

import { useEffect, useRef } from "react";
import { shortenAddress } from "@/components/layout/wallet-panel";
import { useToast } from "@/providers/toast-provider";
import { useWalletContext } from "@/providers/wallet-provider";

export function WalletConnectErrorBridge() {
  const {
    connectError,
    clearConnectError,
    activeWalletName,
    activeAddress,
    isDemoWallet
  } = useWalletContext();
  const toast = useToast();
  const lastReportedErrorRef = useRef<string | null>(null);
  const lastReportedWalletRef = useRef<string | null>(null);
  const hasMountedRef = useRef(false);

  // Error toast — fires whenever the provider records a connectError.
  useEffect(() => {
    if (!connectError) {
      lastReportedErrorRef.current = null;
      return;
    }
    if (lastReportedErrorRef.current === connectError) return;
    lastReportedErrorRef.current = connectError;
    toast.error({
      title: "Wallet connection failed",
      description: connectError
    });
    clearConnectError();
  }, [clearConnectError, connectError, toast]);

  // Connect / disconnect toast — skip the very first render so auto-reconnect
  // doesn't surface a stale "connected" toast on every navigation.
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      lastReportedWalletRef.current = activeWalletName;
      return;
    }

    const previous = lastReportedWalletRef.current;
    if (previous === activeWalletName) return;
    lastReportedWalletRef.current = activeWalletName;

    if (activeWalletName) {
      toast.success({
        title: isDemoWallet ? "Demo wallet active" : "Wallet connected",
        description: isDemoWallet
          ? "Browsing in read-only demo mode."
          : activeAddress
            ? shortenAddress(activeAddress)
            : activeWalletName
      });
    } else if (previous) {
      toast.info({
        title: "Wallet disconnected",
        description: "Reconnect any time from the wallet control in the header."
      });
    }
  }, [activeAddress, activeWalletName, isDemoWallet, toast]);

  return null;
}
