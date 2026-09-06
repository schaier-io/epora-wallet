import type { UTxO } from "@meshsdk/core";

import type { StreamingPaymentFormState } from "@/lib/contracts/state-form";
import type { PayoutTransfer, WalletInputRef } from "@/lib/types/contracts";
import {
  computeStreamingReserveAssets,
  requestedTransferAssets,
  suggestLockedInputsForSpend
} from "@/lib/user-flow/guided-helpers";

export type SelectedFundPoolCoverage = "covered" | "insufficient" | "not-loaded";

export function checkSelectedFundPoolCoverage(input: {
  lockedUtxos: UTxO[];
  selectedRefs: WalletInputRef[];
  transfers: PayoutTransfer[];
  streamingPayments: StreamingPaymentFormState[];
  txLatestTimeMs: number;
  continuingOutputAddress?: string;
}): SelectedFundPoolCoverage {
  const loadedByRef = new Map(
    input.lockedUtxos.map((utxo) => [
      `${utxo.input.txHash}#${utxo.input.outputIndex}`,
      utxo
    ])
  );
  const selectedUtxos = input.selectedRefs.flatMap((ref) => {
    const utxo = loadedByRef.get(`${ref.txHash}#${ref.outputIndex}`);
    return utxo ? [utxo] : [];
  });

  if (selectedUtxos.length !== input.selectedRefs.length) {
    return "not-loaded";
  }

  const suggestion = suggestLockedInputsForSpend(
    selectedUtxos,
    requestedTransferAssets(input.transfers),
    computeStreamingReserveAssets(input.streamingPayments, input.txLatestTimeMs),
    input.continuingOutputAddress
  );
  return suggestion.length > 0 ? "covered" : "insufficient";
}
