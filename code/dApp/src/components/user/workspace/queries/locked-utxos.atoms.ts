import { atom } from "jotai";
import { atomWithQuery } from "jotai-tanstack-query";
import type { UTxO } from "@meshsdk/common";
import { addressUtxosQueryOptions } from "@/lib/query/chain";
import { queryPolicy } from "@/lib/query/keys";
import { chainReadsEnabledAtom } from "@/providers/wallet.atoms";
import { lockingContractAtom } from "./wallet-identity.atoms";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceUseLockedContractUtxos.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceUseLockedContractUtxos", defaultMessages);
const EMPTY_UTXOS: UTxO[] = [];
/** Local refresh intent spans the waits between bounded Send checks. Funds stay in Query. */
export const lockedUtxosRefreshAtom = atom<{ address: string } | null>(null);
export const lockedUtxosEnabledAtom = atom((get) => get(chainReadsEnabledAtom) && Boolean(get(lockingContractAtom).address));
export const lockedUtxosQueryAtom = atomWithQuery((get) => ({
  ...addressUtxosQueryOptions(get(lockingContractAtom).address ?? ""),
  enabled: get(lockedUtxosEnabledAtom),
  refetchInterval: queryPolicy.activePollMs
}));
export const lockedContractUtxosAtom = atom((get) => get(lockedUtxosEnabledAtom)
  ? get(lockedUtxosQueryAtom).data ?? EMPTY_UTXOS : EMPTY_UTXOS);
export const lockedContractUtxosLoadingAtom = atom((get) => get(lockedUtxosEnabledAtom) &&
  (get(lockedUtxosQueryAtom).isPending || get(lockedUtxosQueryAtom).isFetching ||
    get(lockedUtxosRefreshAtom)?.address === get(lockingContractAtom).address));
export const lockedContractUtxosErrorAtom = atom((get) => get(lockedUtxosEnabledAtom) && get(lockedUtxosQueryAtom).error
  ? i18n("couldNotLoadThisWalletSFunds") : null);
