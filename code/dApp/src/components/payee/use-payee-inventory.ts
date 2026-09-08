"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { getSttMintPolicyId } from "@/lib/contracts/blueprint";
import { sttInventoryQueryOptions, isCurrentSttInventoryRead } from "@/lib/query/stt-inventory";
import { queryPolicy } from "@/lib/query/keys";
import { reconcilePayeeInputsAtom } from "./payee-pending-inputs.atoms";

export function usePayeeInventory() {
  const client = useQueryClient();
  const policyId = getSttMintPolicyId();
  const options = sttInventoryQueryOptions(policyId);
  const query = useQuery({ ...options, refetchInterval: queryPolicy.activePollMs });
  const reconcile = useSetAtom(reconcilePayeeInputsAtom);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const snapshot = query.data;
    if (query.isError || !snapshot || snapshot.inventoryRead?.kind !== "full" ||
      client.getQueryData(options.queryKey) !== snapshot ||
      !isCurrentSttInventoryRead(client, policyId, snapshot.inventoryRead.revision)) return;
    reconcile({
      policyId,
      inputKeys: new Set(snapshot.tokens.map((token) => `${token.utxo.input.txHash}#${token.utxo.input.outputIndex}`)),
      fullReadRevision: snapshot.inventoryRead.revision
    });
  }, [client, options.queryKey, policyId, query.data, query.isError, reconcile]);

  const refresh = useCallback(async () => {
    if (!mounted.current) return;
    const next = sttInventoryQueryOptions(policyId);
    await client.cancelQueries({ queryKey: next.queryKey, exact: true });
    if (!mounted.current) return;
    try {
      await client.fetchQuery({ ...next, staleTime: 0 });
    } catch {
      // Query owns the error. Keep a successful transaction's feedback visible.
    }
  }, [client, policyId]);
  return { tokens: query.data?.tokens ?? [], loading: query.isPending || query.isFetching, error: query.error, refresh };
}
