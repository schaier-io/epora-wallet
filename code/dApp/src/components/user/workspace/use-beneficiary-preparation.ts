"use client";
import { useAtomValue, useSetAtom, useAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { beneficiaryPreparationPreviewAtom, beneficiaryPreparationProtocolAtom } from "./atoms/beneficiary-preparation.atoms";
import { beneficiaryPreparationPoolAssetsAtom, consolidateWalletInputsAtom } from "./atoms/forms/consolidate-form.atoms";
import { lockedContractUtxosAtom, lockedContractUtxosLoadingAtom, lockedContractUtxosErrorAtom } from "./atoms/workspace-data.atoms";
import { lockingContractAtom } from "./atoms/workspace-wallet-derivations.atoms";
import { renderNowMsAtom } from "./atoms/workspace-ui.atoms";
import { useWorkspaceActions } from "./workspace-actions-context";

export function useBeneficiaryPreparation() {
  const preview = useAtomValue(beneficiaryPreparationPreviewAtom);
  const protocol = useAtomValue(beneficiaryPreparationProtocolAtom);
  const client = useQueryClient();
  const [poolAssets, setPoolAssets] = useAtom(beneficiaryPreparationPoolAssetsAtom);
  const [selectedRefs, setSelectedRefs] = useAtom(consolidateWalletInputsAtom);
  const utxos = useAtomValue(lockedContractUtxosAtom);
  const loading = useAtomValue(lockedContractUtxosLoadingAtom);
  const discoveryError = useAtomValue(lockedContractUtxosErrorAtom);
  const walletAddress = useAtomValue(lockingContractAtom).address ?? "";
  const setNow = useSetAtom(renderNowMsAtom);
  const { refreshLockedContractUtxos, openWorkspaceIntent } = useWorkspaceActions();
  return { ...preview, poolAssets, setPoolAssets, selectedRefs, setSelectedRefs, utxos,
    loading: loading || protocol?.loading || !protocol,
    discoveryError, walletAddress,
    refresh: () => {
      setNow(Date.now());
      void client.invalidateQueries({ queryKey: queryKeys.protocolParameters(), exact: true });
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
