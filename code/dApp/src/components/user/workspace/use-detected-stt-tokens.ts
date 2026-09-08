"use client";
import { useCallback, useEffect } from "react";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { getSttMintPolicyId, resolveWalletContinuingOutputAddressFromState } from "@/lib/contracts/blueprint";
import { addressUtxosQueryOptions } from "@/lib/query/chain";
import { EMPTY_CONTRACT_CONFIG } from "@/lib/types/contracts";
import { configAtom } from "./atoms/workspace-config.atoms";
import { workspaceSessionAtom } from "./atoms/transaction-flow.atoms";
import { pendingWalletStateUpdateAtom } from "./atoms/wallet-state-update.atoms";
import { detectedSttTokensAtom, sttInventoryQueryAtom, selectedSttQueryAtom, sttInventoryQueryOptions, sttWalletQueryOptions } from "./queries/stt-queries.atoms";
import { permissionWalletSummariesAtom } from "./queries/summary-queries.atoms";
import type { DetectedSttToken } from "@/lib/mesh/detection";

export function useDetectedSttTokens({ selectedDetectedTokenUnit, setSelectedDetectedTokenUnit }: {
  selectedDetectedTokenUnit: string;
  setSelectedDetectedTokenUnit: (unit: string) => void;
}) {
  const store = useStore();
  const client = useAtomValue(queryClientAtom);
  const setConfig = useSetAtom(configAtom);
  const inventory = useAtomValue(sttInventoryQueryAtom);
  const selected = useAtomValue(selectedSttQueryAtom);
  useAtomValue(permissionWalletSummariesAtom);
  const policyId = inventory.data?.policyId ?? selected.data?.policyId;
  useEffect(() => {
    if (!policyId) return;
    setConfig((current) => current.walletPolicyId === policyId ? current
      : { ...EMPTY_CONTRACT_CONFIG, walletPolicyId: policyId, sttSpendReference: current.sttSpendReference });
  }, [policyId, setConfig]);

  const refreshDetectedTokens = useCallback(async ({ keepSelection = false, knownUnit, exactStateRefresh = false }: { keepSelection?: boolean; knownUnit?: string; exactStateRefresh?: boolean } = {}) => {
    if (store.get(pendingWalletStateUpdateAtom) && !exactStateRefresh) return null;
    const session = store.get(workspaceSessionAtom);
    const requestedUnit = knownUnit || (keepSelection ? selectedDetectedTokenUnit || undefined : undefined);
    const options = requestedUnit ? sttWalletQueryOptions(getSttMintPolicyId(), requestedUnit, client)
      : sttInventoryQueryOptions(getSttMintPolicyId());
    await client.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: "none" });
    if (store.get(workspaceSessionAtom) !== session) return null;
    const detected = requestedUnit
      ? await client.fetchQuery(sttWalletQueryOptions(getSttMintPolicyId(), requestedUnit, client))
      : await client.fetchQuery(sttInventoryQueryOptions(getSttMintPolicyId()));
    if (store.get(workspaceSessionAtom) !== session || (store.get(pendingWalletStateUpdateAtom) && !exactStateRefresh)) return null;
    const tokens = requestedUnit
      ? [...store.get(detectedSttTokensAtom).filter((token) => token.unit !== requestedUnit), ...detected.tokens]
      : detected.tokens;
    if (keepSelection && selectedDetectedTokenUnit && !tokens.some((token) => token.unit === selectedDetectedTokenUnit)) return null;
    if (!tokens.some((token) => token.unit === selectedDetectedTokenUnit)) {
      if (selectedDetectedTokenUnit) setSelectedDetectedTokenUnit("");
      setConfig((current) => ({ ...current, walletPolicyId: detected.policyId, sttAssetNameHex: "", walletAssetNameHex: "" }));
    }
    return { ...detected, tokens, sttUtxos: tokens.map((token) => token.utxo) };
  }, [client, selectedDetectedTokenUnit, setConfig, setSelectedDetectedTokenUnit, store]);

  const refreshPermissionWalletSummaries = useCallback(async (tokens: DetectedSttToken[] = store.get(detectedSttTokensAtom)) => {
    const session = store.get(workspaceSessionAtom);
    await Promise.allSettled(tokens.map(async (token) => {
      const address = resolveWalletContinuingOutputAddressFromState({ sttPolicyId: token.policyId, sttAssetNameHex: token.assetNameHex, stateDatum: token.datum });
      const options = addressUtxosQueryOptions(address);
      await client.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: "none" });
      if (store.get(workspaceSessionAtom) !== session) return;
      await client.fetchQuery(options);
    }));
  }, [client, store]);
  return { refreshDetectedTokens, refreshPermissionWalletSummaries };
}
