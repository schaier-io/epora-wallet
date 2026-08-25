"use client";

import { atom } from "jotai";
import type { UTxO } from "@meshsdk/core";
import { type WealthSeriesPoint } from "@/components/user/wealth-chart";
import { getValidityWindow } from "@/lib/mesh/transactions";
import {
  buildStreamingPaymentPayoutTransfer,
  computeStreamingPaymentDueAmount,
  requestedTransferAssets,
  streamingPaymentNeedsZeroDeltaCleanup,
  suggestLockedInputsForSpend
} from "@/lib/user-flow/guided-helpers";
import { lovelaceToAdaNumber } from "@/lib/units/lovelace";
import { type PayoutTransfer } from "@/lib/types/contracts";
import {
  buildAssetSelectionOptions,
  getAssetQuantityByUnit,
  isAsset,
  mergeAmountLists,
  subtractAmountLists
} from "@/components/user/workspace/helpers";
import { lockedContractUtxosAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import {
  streamingPaymentPayoutAmountsAtom,
  sttExtraTransfersAtom,
  sttInputOutputIndexAtom,
  sttInputTxHashAtom,
  sttWalletInputsAtom,
  sttWalletOutputsAtom
} from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { transferSelectedUnitAtom } from "@/components/user/workspace/atoms/forms/transfer-form.atoms";
import { renderNowMsAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { effectiveSttActionAtom, selectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { recentWalletActivityEventsAtom } from "@/components/user/workspace/atoms/workspace-activity.atoms";
import {
  activeInferredSttStateFormAtom,
  lockingContractAtom,
  totalLockedContractAssetsAtom
} from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";

/**
 * Transfer / locked-asset / wealth-chart / streaming-payout derivations as derived atoms over the
 * activity feed, the STT-spend + transfer forms, locked utxos, and the wallet/selection atoms —
 * converted from the memo-only useWorkspaceTransferDerivations (every input is now an atom). Views
 * read these directly; the hook is gone.
 */

/**
 * When a series point goes on the time axis.
 *
 * There used to be a middle rung here: `blockTime ?? 0` and then, failing that, the slot
 * treated as unix seconds. A slot is a count of ticks since the network's own origin, not
 * since 1970, so `slot * 1000` did not produce a time at all. The fixture wallet's slot,
 * 131928483, resolves to 1974-03-07T22:48:03.000Z, which is far older than any range cutoff:
 * the point vanished from 7D, 30D, 90D and 1Y, and in ALL it stretched the axis across half a
 * century and flattened everything real into a flat line at the right edge.
 *
 * An untimed event has no place on a time axis. Placing it at render time is an approximation,
 * but a bounded one, and it keeps the newest value on the chart equal to the balance the rest
 * of the app shows.
 */
export function seriesPointTimestampMs(
  transaction: { blockTime?: number | null },
  renderNowMs: number
): number {
  return (transaction.blockTime ?? 0) * 1000 || renderNowMs;
}

export const wealthSeriesAtom = atom<WealthSeriesPoint[]>((get) => {
  const walletAddress = get(lockingContractAtom).address;
  const events = get(recentWalletActivityEventsAtom);
  if (!walletAddress || events.length === 0) return [];
  const renderNowMs = get(renderNowMsAtom);
  const sorted = [...events].sort(
    (a, b) => (a.transaction.blockTime ?? 0) - (b.transaction.blockTime ?? 0)
  );
  let running = 0n;
  const series: WealthSeriesPoint[] = [];
  for (const event of sorted) {
    const inputSum = event.inputUtxos
      .filter((u) => u.output?.address === walletAddress)
      .reduce((acc, u) => acc + BigInt(getAssetQuantityByUnit(u.output?.amount ?? [], "lovelace") ?? "0"), 0n);
    const outputSum = event.outputUtxos
      .filter((u) => u.output?.address === walletAddress)
      .reduce((acc, u) => acc + BigInt(getAssetQuantityByUnit(u.output?.amount ?? [], "lovelace") ?? "0"), 0n);
    running += outputSum - inputSum;
    const ts = seriesPointTimestampMs(event.transaction, renderNowMs);
    series.push({ timestamp: ts, value: lovelaceToAdaNumber(running) });
  }
  return series;
});

export const wealthSeriesForAssetAtom = atom<(unit: string) => WealthSeriesPoint[]>((get) => {
  const walletAddress = get(lockingContractAtom).address;
  const events = get(recentWalletActivityEventsAtom);
  const renderNowMs = get(renderNowMsAtom);
  return (unit: string) => {
    if (!walletAddress || events.length === 0) return [];
    const isAda = unit === "lovelace";
    const sorted = [...events].sort(
      (a, b) => (a.transaction.blockTime ?? 0) - (b.transaction.blockTime ?? 0)
    );
    let running = 0n;
    const series: WealthSeriesPoint[] = [];
    for (const event of sorted) {
      const inputSum = event.inputUtxos
        .filter((u) => u.output?.address === walletAddress)
        .reduce((acc, u) => acc + BigInt(getAssetQuantityByUnit(u.output?.amount ?? [], unit) ?? "0"), 0n);
      const outputSum = event.outputUtxos
        .filter((u) => u.output?.address === walletAddress)
        .reduce((acc, u) => acc + BigInt(getAssetQuantityByUnit(u.output?.amount ?? [], unit) ?? "0"), 0n);
      running += outputSum - inputSum;
      const ts = seriesPointTimestampMs(event.transaction, renderNowMs);
      series.push({ timestamp: ts, value: isAda ? lovelaceToAdaNumber(running) : Number(running) });
    }
    return series;
  };
});

export const selectedLockedContractAssetsAtom = atom((get) => {
  const lockedContractUtxos = get(lockedContractUtxosAtom);
  const selectedUtxos = get(sttWalletInputsAtom)
    .map((ref) =>
      lockedContractUtxos.find(
        (utxo) => utxo.input.txHash === ref.txHash && utxo.input.outputIndex === ref.outputIndex
      )
    )
    .filter((utxo): utxo is UTxO => Boolean(utxo));
  return mergeAmountLists(selectedUtxos.map((utxo) => utxo.output.amount.filter(isAsset)));
});

export const allocatedLockedContractAssetsAtom = atom((get) =>
  mergeAmountLists([
    ...get(sttWalletOutputsAtom).map((output) => output.amount),
    ...get(sttExtraTransfersAtom).map((transfer) => transfer.amount)
  ])
);

export const transferSourceAssetsAtom = atom((get) => {
  const action = get(effectiveSttActionAtom);
  return action === "use" || action === "use-allowance" || action === "use-beneficiary"
    ? get(totalLockedContractAssetsAtom)
    : get(selectedLockedContractAssetsAtom);
});

export const availableLockedTransferAssetsAtom = atom((get) =>
  subtractAmountLists(get(transferSourceAssetsAtom), get(allocatedLockedContractAssetsAtom)).sort(
    (left, right) => {
      if (left.unit === "lovelace") return -1;
      if (right.unit === "lovelace") return 1;
      return left.unit.localeCompare(right.unit);
    }
  )
);

export const availableLockedTransferAssetOptionsAtom = atom((get) =>
  buildAssetSelectionOptions(get(availableLockedTransferAssetsAtom))
);

export const selectedTransferAssetAtom = atom((get) => {
  const unit = get(transferSelectedUnitAtom);
  return get(availableLockedTransferAssetsAtom).find((asset) => asset.unit === unit) ?? null;
});

export const streamingPaymentPayoutRowsAtom = atom((get) => {
  const renderNowMs = get(renderNowMsAtom);
  const validityWindow = getValidityWindow(renderNowMs);
  const payoutAmounts = get(streamingPaymentPayoutAmountsAtom);
  return get(activeInferredSttStateFormAtom).streamingPayments.map((streamingPayment) => {
    const dueAmount = computeStreamingPaymentDueAmount(
      streamingPayment,
      validityWindow.earliestTimeMs
    );
    return {
      streamingPayment,
      dueAmount,
      cleanupRequired: streamingPaymentNeedsZeroDeltaCleanup(streamingPayment),
      configuredAmount: payoutAmounts[streamingPayment.id] ?? dueAmount,
      unit: streamingPayment.policyId.trim()
        ? `${streamingPayment.policyId.trim()}${streamingPayment.assetName.trim()}`
        : "lovelace"
    };
  });
});

export const streamingPaymentPayoutTransfersAtom = atom<PayoutTransfer[]>((get) => {
  const sttInputOutputIndex = get(sttInputOutputIndexAtom);
  if (!/^\d+$/.test(sttInputOutputIndex)) return [];
  const sttInputTxHash = get(sttInputTxHashAtom);
  return get(streamingPaymentPayoutRowsAtom).flatMap((row) => {
    const quantity = row.configuredAmount.trim();
    if (!/^\d+$/.test(quantity) || BigInt(quantity) <= 0n) return [];
    return [
      buildStreamingPaymentPayoutTransfer(
        row.streamingPayment,
        quantity,
        sttInputTxHash,
        Number(sttInputOutputIndex)
      )
    ];
  });
});

export const requestedLockedAssetTotalsAtom = atom((get) => {
  if (get(selectedActionAtom) === "payout-streaming-payment") {
    return requestedTransferAssets(get(streamingPaymentPayoutTransfersAtom));
  }
  return mergeAmountLists(get(sttExtraTransfersAtom).map((transfer) => transfer.amount));
});

export const suggestedLockedInputsAtom = atom((get) =>
  // Reserve-aware (see suggestLockedInputsForSpend): with streaming payments the
  // suggestion must leave each asset's reserve in the change, so it selects all
  // pools rather than the smallest payout-covering set — which could pick a pool
  // too small to keep the reserve and fail on-chain with a generic eval error.
  suggestLockedInputsForSpend(
    get(lockedContractUtxosAtom),
    get(requestedLockedAssetTotalsAtom),
    get(activeInferredSttStateFormAtom).streamingPayments.length > 0
  )
);
