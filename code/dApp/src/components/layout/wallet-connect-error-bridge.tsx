"use client";
import { useTranslations } from "next-intl";


import { useEffect, useRef } from "react";
import { shortenAddress } from "@/lib/utils/explorer";
import { useToast } from "@/providers/toast-provider";
import { useWalletContext } from "@/providers/wallet-provider";

export function WalletConnectErrorBridge() {
  const i18n = useTranslations("ComponentsLayoutWalletConnectErrorBridge");
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

  // Error toast: fires whenever the provider records a connectError.
  useEffect(() => {
    if (!connectError) {
      lastReportedErrorRef.current = null;
      return;
    }
    if (lastReportedErrorRef.current === connectError) return;
    lastReportedErrorRef.current = connectError;
    toast.error({
      title: i18n("walletConnectionFailed"),
      description: connectError
    });
    clearConnectError();
  }, [clearConnectError, connectError, i18n, toast]);

  // Connect / disconnect toast: skip the very first render so auto-reconnect
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
        title: isDemoWallet ? i18n("demoOpened") : i18n("walletConnected"),
        description: isDemoWallet
          ? i18n("browseTheDemoSigningStaysDisabled")
          : activeAddress
            ? shortenAddress(activeAddress)
            : activeWalletName
      });
    } else if (previous) {
      toast.info({
        title: i18n("walletDisconnected"),
        description: i18n("reconnectFromTheWalletButtonInTheHeader")
      });
    }
  }, [activeAddress, activeWalletName, i18n, isDemoWallet, toast]);

  return null;
}
