"use client";
import { useCallback, useEffect, useRef } from "react";
import { useAtomValue, useStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { addressUtxosQueryOptions } from "@/lib/query/chain";
import { lockedUtxosQueryAtom, lockedUtxosRefreshAtom } from "./queries/locked-utxos.atoms";
import { SEND_FUNDS_REFRESH_MAX_ATTEMPTS, SEND_FUNDS_REFRESH_RETRY_MS } from "./constants";
import { workspaceSessionAtom } from "./atoms/transaction-flow.atoms";
import { selectedOrphanInputsAtom } from "./atoms/forms/orphan-inputs.atoms";
import { lockingContractAtom } from "./queries/wallet-identity.atoms";

export function useLockedContractUtxos() {
  const client = useAtomValue(queryClientAtom);
  const store = useStore();
  const session = useAtomValue(workspaceSessionAtom);
  const ownRefresh = useRef<{ address: string } | null>(null);
  useAtomValue(lockedUtxosQueryAtom);
  useEffect(() => () => {
    if (store.get(lockedUtxosRefreshAtom) === ownRefresh.current) store.set(lockedUtxosRefreshAtom, null);
  }, [store]);
  const refreshLockedContractUtxos = useCallback(async (address: string | null, {
    retryEmpty = false, preserveRecovery = false
  }: { retryEmpty?: boolean; preserveRecovery?: boolean } = {}) => {
    if (!address || store.get(workspaceSessionAtom) !== session) return;
    if (!preserveRecovery && address === store.get(lockingContractAtom).address) {
      store.set(selectedOrphanInputsAtom, null);
    }
    const options = addressUtxosQueryOptions(address);
    const request = { address };
    ownRefresh.current = request;
    store.set(lockedUtxosRefreshAtom, request);
    try {
      const maxAttempts = retryEmpty ? SEND_FUNDS_REFRESH_MAX_ATTEMPTS : 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (store.get(workspaceSessionAtom) !== session || store.get(lockedUtxosRefreshAtom) !== request) return;
        await client.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: "none" });
        if (store.get(workspaceSessionAtom) !== session || store.get(lockedUtxosRefreshAtom) !== request) return;
        const utxos = await client.fetchQuery(options);
        if (utxos.length > 0 || attempt === maxAttempts) return;
        await new Promise(resolve => setTimeout(resolve, SEND_FUNDS_REFRESH_RETRY_MS));
      }
    } catch {
      // Query retains the last result and exposes the request error to all readers.
    } finally {
      if (store.get(lockedUtxosRefreshAtom) === request) store.set(lockedUtxosRefreshAtom, null);
    }
  }, [client, session, store]);
  return { refreshLockedContractUtxos };
}
