"use client";

import { atom } from "jotai";
import { activeWalletAtom, isDemoWalletAtom, networkIdAtom } from "@/providers/wallet.atoms";
import { dismissedSubmitHashAtom, submitHashAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { sharedReferenceBusyAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";

/**
 * Small build/flow flags as derived atoms over the wallet + transaction-flow + shared-reference
 * atoms — converted from the foundation's inline consts so views read them directly and the tx
 * builders read canBuildTransactions via the store.
 */

/** A real (non-demo) Preprod wallet is connected, so transactions can be built. */
export const canBuildTransactionsAtom = atom((get) =>
  Boolean(get(activeWalletAtom) && !get(isDemoWalletAtom) && get(networkIdAtom) === 0)
);

/** The mint progress overlay was dismissed for the current submission. */
export const mintProgressDismissedAtom = atom((get) => {
  const submitHash = get(submitHashAtom);
  return submitHash != null && submitHash === get(dismissedSubmitHashAtom);
});

/** Label for the shared-reference setup-helper action button. */
export const sharedReferenceActionLabelAtom = atom((get) => {
  const busy = get(sharedReferenceBusyAtom);
  return busy === "build"
    ? "Preparing..."
    : busy === "submit"
      ? "Opening wallet..."
      : "Create setup helper";
});

/** Whether the shared-reference setup-helper action is disabled. */
export const sharedReferenceActionDisabledAtom = atom(
  (get) => !get(canBuildTransactionsAtom) || get(sharedReferenceBusyAtom) !== null
);
