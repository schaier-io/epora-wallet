"use client";

import { useEffect } from "react";
import { useAtomValue, useStore } from "jotai";
import { activeAddressAtom, networkIdAtom } from "@/providers/wallet.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { activeSubmitAtom, submitConfirmedAtom, submitConfirmationUnseenAtom, submitHashAtom, submittedActionAtom, workspaceSessionAtom } from "./atoms/transaction-flow.atoms";
import { DEPOSIT_RECEIPT_EVENT, depositReceiptKey, readDepositReceipt } from "./deposit-receipt";
import { watchTransactionConfirmation } from "./watch-transaction-confirmation";

/** Restore the deposit receipt only in Receive, without blocking other wallet actions. */
export function useDepositReceiptRecovery(): void {
  const store = useStore();
  const address = useAtomValue(activeAddressAtom);
  const network = useAtomValue(networkIdAtom);
  const activeSubmit = useAtomValue(activeSubmitAtom);
  // Re-enabling the same account replaces the wallet API and retires its previous watch.
  const session = useAtomValue(workspaceSessionAtom);
  const route = useAtomValue(routeStateAtom);
  const walletUnit = route.selectedWalletUnit;
  const action = route.selectedAction;
  useEffect(() => {
    if (!address || network === null || !walletUnit || action !== "lock-funds") return;
    const receiptKey = depositReceiptKey({ address, network, walletUnit });
    const restore = (event?: Event) => {
      if (event instanceof StorageEvent && (event.storageArea !== localStorage ||
        (event.key !== null && event.key !== receiptKey))) return;
      if (store.get(activeSubmitAtom)) return;
      const receipt = readDepositReceipt({ address, network, walletUnit });
      if (!receipt) return;
      const currentHash = store.get(submitHashAtom);
      if (currentHash && (currentHash !== receipt.txHash || store.get(submitConfirmedAtom))) return;
      if (!currentHash) {
        store.set(submittedActionAtom, "lock-funds");
        store.set(submitHashAtom, receipt.txHash);
        store.set(submitConfirmedAtom, false);
        store.set(submitConfirmationUnseenAtom, false);
      }
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
  }, [address, network, walletUnit, action, activeSubmit, session, store]);
}
