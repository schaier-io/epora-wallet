import { atom } from "jotai";

import { EMPTY_CONTRACT_CONFIG, type ContractConfig } from "@/lib/types/contracts";

/**
 * The resolved on-chain contract config for the active wallet (script addresses, the STT
 * policy id / asset-name, etc.). It is FUND-CRITICAL: the transaction builders read it to
 * construct every tx, so it must be populated correctly per wallet and reset on unmount.
 *
 * Loaded by `useDetectedSttTokens` (from the blueprint + detected token) and refined by the
 * wallet-session / navigation flows. Promoted from the controller's `useState` to an atom so
 * those writers and all readers (derivations, builders, views) reach it directly instead of
 * threading it through the controller. The controller keeps a `useAtom(configAtom)`
 * subscription so it re-renders on config change — that keeps the builders' render-time
 * `jotaiStore.get(configAtom)` snapshot current.
 */
export const configAtom = atom<ContractConfig>({ ...EMPTY_CONTRACT_CONFIG });

/** Reset config to the empty default (called on workspace unmount). */
export const resetConfigAtom = atom(null, (_get, set) => {
  set(configAtom, { ...EMPTY_CONTRACT_CONFIG });
});
