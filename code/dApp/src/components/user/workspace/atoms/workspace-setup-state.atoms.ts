"use client";

import { atom } from "jotai";
import type { SetupState } from "@/components/user/flow-types";
import { resolveSttReferenceStoreAddress } from "@/lib/contracts/blueprint";
import {
  activeAddressAtom,
  activePaymentKeyHashAtom,
  activeWalletNameAtom,
  networkIdAtom,
  walletReadyAtom
} from "@/providers/wallet.atoms";
import { selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { lockingContractAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import {
  lockedContractUtxosAtom,
  lockedContractUtxosLoadingAtom,
  sharedSttReferenceStoreAtom,
  sharedSttReferenceStoreErrorAtom,
  sharedSttReferenceStoreLoadingAtom
} from "@/components/user/workspace/atoms/workspace-data.atoms";

/**
 * The setup readiness snapshot (wallet identity, shared-reference status, locking-contract address,
 * locked-utxo counts) as a derived atom — every input is already an atom. Converted from the
 * controller's setupState memo; consumed by the setup views and the review derivations.
 */
export const setupStateAtom = atom<SetupState>((get) => {
  const store = get(sharedSttReferenceStoreAtom);
  const lockingContract = get(lockingContractAtom);
  return {
    walletName: get(activeWalletNameAtom),
    activeAddress: get(activeAddressAtom),
    paymentKeyHash: get(activePaymentKeyHashAtom),
    networkId: get(networkIdAtom),
    walletReady: get(walletReadyAtom),
    hasDetectedToken: Boolean(get(selectedDetectedTokenAtom)),
    sharedSttReferenceStatus: get(sharedSttReferenceStoreLoadingAtom)
      ? "loading"
      : store?.status ?? "missing",
    sharedSttReferenceRef: store?.activeReference ?? null,
    sharedSttReferenceStoreAddress: store?.storeAddress ?? resolveSttReferenceStoreAddress(),
    sharedSttReferenceError: get(sharedSttReferenceStoreErrorAtom),
    lockingContractAddress: lockingContract.address,
    lockingContractError: lockingContract.error,
    lockedUtxoCount: get(lockedContractUtxosAtom).length,
    lockedUtxosLoading: get(lockedContractUtxosLoadingAtom)
  };
});
