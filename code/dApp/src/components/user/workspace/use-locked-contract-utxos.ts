"use client";

import { useCallback, useRef } from "react";
import { useSetAtom } from "jotai";
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
  const setLockedContractUtxos = useSetAtom(lockedContractUtxosAtom);
  const setLockedContractUtxosLoading = useSetAtom(lockedContractUtxosLoadingAtom);
  const setLockedContractUtxosError = useSetAtom(lockedContractUtxosErrorAtom);
  const requestIdRef = useRef(0);

  const refreshLockedContractUtxos = useCallback(
    async (lockingContractAddress: string | null) => {
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
        if (requestIdRef.current !== requestId) {
          return;
        }
        setLockedContractUtxos(utxos);
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setLockedContractUtxos([]);
        setLockedContractUtxosError(
          error instanceof Error ? error.message : "Unable to load locking contract UTxOs."
        );
      } finally {
        if (requestIdRef.current === requestId) {
          setLockedContractUtxosLoading(false);
        }
      }
    },
    [setLockedContractUtxos, setLockedContractUtxosLoading, setLockedContractUtxosError]
  );

  return { refreshLockedContractUtxos };
}
