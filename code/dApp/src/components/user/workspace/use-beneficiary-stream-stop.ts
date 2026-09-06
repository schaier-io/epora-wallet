"use client";
import { useAtomValue, useSetAtom } from "jotai";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { activeInferredSttStateFormAtom } from "./atoms/workspace-wallet-derivations.atoms";
import { renderNowMsAtom } from "./atoms/workspace-ui.atoms";
import { beneficiaryStreamStopIdAtom } from "./atoms/forms/stt-spend-form.atoms";
import { selectedActionAtom } from "./atoms/workspace-selection.atoms";
import { deriveBeneficiaryStreamStopPreview } from "./beneficiary-stream-stop-model";
import { deriveStreamingPaymentRowStatus } from "./streaming-payment-status";
import { streamingPaymentNeedsZeroDeltaCleanup } from "@/lib/user-flow/guided-helpers";
import { useWorkspaceActions } from "./workspace-actions-context";

export function useBeneficiaryStreamStop() {
  const form = useAtomValue(activeInferredSttStateFormAtom);
  const signer = useAtomValue(activePaymentKeyHashAtom);
  const nowMs = useAtomValue(renderNowMsAtom);
  const setNowMs = useSetAtom(renderNowMsAtom);
  const selectedId = useAtomValue(beneficiaryStreamStopIdAtom);
  const action = useAtomValue(selectedActionAtom);
  const { handleBeneficiaryStreamStopSelect, openWorkspaceIntent } = useWorkspaceActions();
  const rows = form.streamingPayments.map((stream) => ({
    stream,
    ...deriveBeneficiaryStreamStopPreview(form, signer, stream.id, nowMs),
    selected: action === "stop-beneficiary-stream" && selectedId === stream.id,
    status: nowMs > 0 ? deriveStreamingPaymentRowStatus({
      cleanupRequired: streamingPaymentNeedsZeroDeltaCleanup(stream),
      startDateMs: BigInt(stream.startDate), endDateMs: BigInt(stream.endDate), nowMs
    }).kind : null
  }));
  return { rows, select: handleBeneficiaryStreamStopSelect,
    refreshTime: () => setNowMs(Date.now()),
    settle: () => openWorkspaceIntent("pay-streaming-payments", "payout-streaming-payment", "streaming-payments-pay-due") };
}
