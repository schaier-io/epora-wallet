"use client";
import { useBeneficiaryPreparationNavigation } from "./use-beneficiary-preparation-navigation";
import { useAtomValue, useSetAtom, useAtom } from "jotai";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { activeInferredSttStateFormAtom, lockingContractAtom } from "./atoms/workspace-wallet-derivations.atoms";
import { lockedContractUtxosAtom, lockedContractUtxosLoadingAtom, lockedContractUtxosErrorAtom } from "./atoms/workspace-data.atoms";
import { renderNowMsAtom } from "./atoms/workspace-ui.atoms";
import { sttWalletInputsAtom, sttInputTxHashAtom, sttInputOutputIndexAtom } from "./atoms/forms/stt-spend-form.atoms";
import { deriveBeneficiaryDistributionPreview } from "./beneficiary-distribution-model";
import { useWorkspaceActions } from "./workspace-actions-context";

export function useBeneficiaryDistribution() {
  const prepare = useBeneficiaryPreparationNavigation();
  const form = useAtomValue(activeInferredSttStateFormAtom);
  const signer = useAtomValue(activePaymentKeyHashAtom);
  const utxos = useAtomValue(lockedContractUtxosAtom);
  const loading = useAtomValue(lockedContractUtxosLoadingAtom);
  const discoveryError = useAtomValue(lockedContractUtxosErrorAtom);
  const lockingContract = useAtomValue(lockingContractAtom);
  const nowMs = useAtomValue(renderNowMsAtom);
  const setNowMs = useSetAtom(renderNowMsAtom);
  const [selectedRefs, setSelectedRefs] = useAtom(sttWalletInputsAtom);
  const txHash = useAtomValue(sttInputTxHashAtom);
  const outputIndex = useAtomValue(sttInputOutputIndexAtom);
  const { openWorkspaceIntent, refreshLockedContractUtxos } = useWorkspaceActions();
  const preview = deriveBeneficiaryDistributionPreview({ form, signer, selectedRefs, utxos,
    loading, discoveryError, nowMs, sttInput: { txHash, outputIndex: Number(outputIndex) } });
  return { ...preview, prepare, selectedRefs, setSelectedRefs, utxos, loading, discoveryError,
    hasStreams: form.streamingPayments.length > 0,
    refreshFunds: lockingContract.address ? () => { void refreshLockedContractUtxos(lockingContract.address); } : undefined,
    refreshTime: () => setNowMs(Date.now()),
    stopStreams: () => openWorkspaceIntent("send", "stop-beneficiary-stream"),
    settle: () => openWorkspaceIntent("pay-streaming-payments", "payout-streaming-payment", "streaming-payments-pay-due") };
}
