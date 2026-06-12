"use client";

import { atom } from "jotai";
import {
  createDefaultStateForm,
  stateFormFromDatum,
  withFallbackAdminUserInStateForm
} from "@/lib/contracts/state-form";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import { suggestNewWalletName } from "@/components/user/workspace/helpers";
import { detectedSttTokensAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";

/**
 * Defaults for the mint (new-wallet) flow as derived atoms: the names already in use, the next
 * suggested wallet name, and the auto-seeded state form (default rules + connected signer as admin).
 * Converted from the memo-only foundation derivations; pure over the detected-tokens data atom and
 * the connected payment-key-hash atom.
 */
export const existingWalletNamesAtom = atom((get) =>
  get(detectedSttTokensAtom).map((token) =>
    normalizeWalletName(stateFormFromDatum(token.datum).walletName)
  )
);

export const suggestedMintWalletNameAtom = atom((get) =>
  suggestNewWalletName(get(existingWalletNamesAtom))
);

export const autoMintStateFormAtom = atom((get) => {
  const namedBaseState = {
    ...createDefaultStateForm(),
    walletName: get(suggestedMintWalletNameAtom)
  };
  const paymentKeyHash = get(activePaymentKeyHashAtom);
  return paymentKeyHash
    ? withFallbackAdminUserInStateForm(namedBaseState, paymentKeyHash)
    : namedBaseState;
});
