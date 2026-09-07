"use client";
import { useAtomValue, useSetAtom, useAtom } from "jotai";
import { useEffect, useState } from "react";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { beneficiaryPreparationPreviewAtom, beneficiaryPreparationProtocolAtom } from "./atoms/beneficiary-preparation.atoms";
import { beneficiaryPreparationPoolAssetsAtom, consolidateWalletInputsAtom } from "./atoms/forms/consolidate-form.atoms";
import { lockedContractUtxosAtom, lockedContractUtxosLoadingAtom, lockedContractUtxosErrorAtom } from "./atoms/workspace-data.atoms";
import { lockingContractAtom } from "./atoms/workspace-wallet-derivations.atoms";
import { renderNowMsAtom } from "./atoms/workspace-ui.atoms";
import { useWorkspaceActions } from "./workspace-actions-context";

export function useBeneficiaryPreparation() {
  const preview = useAtomValue(beneficiaryPreparationPreviewAtom);
  const [protocol, setProtocol] = useAtom(beneficiaryPreparationProtocolAtom);
  const [poolAssets, setPoolAssets] = useAtom(beneficiaryPreparationPoolAssetsAtom);
  const [selectedRefs, setSelectedRefs] = useAtom(consolidateWalletInputsAtom);
  const utxos = useAtomValue(lockedContractUtxosAtom);
  const loading = useAtomValue(lockedContractUtxosLoadingAtom);
  const discoveryError = useAtomValue(lockedContractUtxosErrorAtom);
  const walletAddress = useAtomValue(lockingContractAtom).address ?? "";
  const setNow = useSetAtom(renderNowMsAtom);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { refreshLockedContractUtxos, openWorkspaceIntent } = useWorkspaceActions();
  useEffect(() => {
    let current = true;
    setProtocol(null);
    if (walletAddress) {
      void new ServerFetcher().fetchProtocolParameters().then(params => {
        if (current) setProtocol({ address: walletAddress, params, error: false });
      }, () => {
        if (current) setProtocol({ address: walletAddress, params: null, error: true });
      });
    }
    return () => { current = false; };
  }, [walletAddress, refreshVersion, setProtocol]);
  return { ...preview, poolAssets, setPoolAssets, selectedRefs, setSelectedRefs, utxos,
    loading: loading || !protocol || protocol.address !== walletAddress,
    discoveryError, walletAddress,
    refresh: () => {
      setNow(Date.now());
      setRefreshVersion(value => value + 1);
      if (walletAddress) void refreshLockedContractUtxos(walletAddress);
    },
    correctAda: () => {
      const amount = preview.plan?.suggestedPoolLovelace;
      if (amount === null || amount === undefined) return;
      setPoolAssets(current => [{ unit: "lovelace", quantity: String(amount) }, ...current.filter(asset => asset.unit !== "lovelace")]);
    },
    addFunds: () => openWorkspaceIntent("add-funds", "lock-funds"),
    distribute: () => openWorkspaceIntent("send", "distribute-beneficiaries"),
    finish: () => openWorkspaceIntent("send", "use-beneficiary")
  };
}
