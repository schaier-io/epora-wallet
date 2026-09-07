"use client";
import { useTranslations } from "next-intl";


import { useCallback, useEffect, useRef } from "react";
import { workspaceSessionAtom } from "./atoms/transaction-flow.atoms";
import { useSetAtom, useStore } from "jotai";
import { fetchScriptUtxos } from "@/components/user/workspace/helpers";
import {
  lockedContractUtxosAtom,
  lockedContractUtxosErrorAtom,
  lockedContractUtxosLoadingAtom
} from "@/components/user/workspace/atoms/workspace-data.atoms";

/**
 * Owns the fetch for the UTxOs sitting at the selected wallet's locking-contract address and
 * writes the result to the shared `lockedContractUtxos*` atoms. Mounted once by the controller;
 * every reader (derivations, views) reads the atoms via `useAtomValue`. The fetch takes the
 * address as a parameter, so the auto-fetch effect and the manual refresh callers pass
 * `lockingContract.address` once it is available. A request-id guard makes out-of-order responses
 * (address switches, rapid manual refreshes) unable to overwrite a newer result.
 */
export function useLockedContractUtxos() {
  const store = useStore();
  const i18n = useTranslations("ComponentsUserWorkspaceUseLockedContractUtxos");
  const setLockedContractUtxos = useSetAtom(lockedContractUtxosAtom);
  const setLockedContractUtxosLoading = useSetAtom(lockedContractUtxosLoadingAtom);
  const setLockedContractUtxosError = useSetAtom(lockedContractUtxosErrorAtom);
  const requestIdRef = useRef(0);
  useEffect(() => () => { requestIdRef.current += 1; }, []);

  const refreshLockedContractUtxos = useCallback(
    async (lockingContractAddress: string | null) => {
      const session = store.get(workspaceSessionAtom);
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (!lockingContractAddress) {
        setLockedContractUtxos([]);
        setLockedContractUtxosLoading(false);
        setLockedContractUtxosError(null);
        return;
      }

      setLockedContractUtxosLoading(true);
      setLockedContractUtxosError(null);

      try {
        const utxos = await fetchScriptUtxos(lockingContractAddress);
        if (requestIdRef.current !== requestId || store.get(workspaceSessionAtom) !== session) {
          return;
        }
        setLockedContractUtxos(utxos);
      } catch {
        if (requestIdRef.current !== requestId || store.get(workspaceSessionAtom) !== session) {
          return;
        }
        setLockedContractUtxos([]);
        setLockedContractUtxosError(i18n("couldNotLoadThisWalletSFunds"));
      } finally {
        if (requestIdRef.current === requestId) {
          setLockedContractUtxosLoading(false);
        }
      }
    },
    [store, setLockedContractUtxos, setLockedContractUtxosLoading, setLockedContractUtxosError, i18n]
  );

  return { refreshLockedContractUtxos };
}
