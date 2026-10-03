"use client";

import { useEffect } from "react";
import { useAtomValue, useStore } from "jotai";
import { activeAddressAtom, networkIdAtom } from "@/providers/wallet.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { activeSubmitAtom, submitConfirmedAtom, submitConfirmationUnseenAtom, submitHashAtom } from "./atoms/transaction-flow.atoms";
import { DEPOSIT_RECEIPT_EVENT, readDepositReceipt } from "./deposit-receipt";
import { watchTransactionConfirmation } from "./watch-transaction-confirmation";

/** Restore the deposit receipt only in Receive, without blocking other wallet actions. */
export function useDepositReceiptRecovery(): void {
  const store = useStore();
  const address = useAtomValue(activeAddressAtom);
  const network = useAtomValue(networkIdAtom);
  const activeSubmit = useAtomValue(activeSubmitAtom);
  const route = useAtomValue(routeStateAtom);
  const walletUnit = route.selectedWalletUnit;
  const action = route.selectedAction;
  useEffect(() => {
    if (!address || network === null || !walletUnit || action !== "lock-funds") return;
    const restore = () => {
      if (store.get(activeSubmitAtom) || store.get(submitHashAtom)) return;
      const receipt = readDepositReceipt({ address, network, walletUnit });
      if (!receipt) return;
      store.set(submitHashAtom, receipt.txHash);
      store.set(submitConfirmedAtom, false);
      store.set(submitConfirmationUnseenAtom, false);
      void watchTransactionConfirmation(store, receipt.txHash, "lock-funds").catch(error =>
        console.error("[deposit-receipt:confirmation]", error));
    };
    restore();
    window.addEventListener("storage", restore);
    window.addEventListener(DEPOSIT_RECEIPT_EVENT, restore);
    return () => {
      window.removeEventListener("storage", restore);
      window.removeEventListener(DEPOSIT_RECEIPT_EVENT, restore);
    };
  }, [address, network, walletUnit, action, activeSubmit, store]);
}
