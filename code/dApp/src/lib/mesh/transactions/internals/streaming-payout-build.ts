import { createNoChangeAdaSelector } from "./no-change-ada-selector";
import type {
  AdjustableLovelaceOutput,
  RuntimeTxBuilder
} from "./budget-runtime-builder";
import {
  getLovelaceQuantity,
  sendAssetsWithOptionalInlineDatumAndReferenceScript
} from "./value";
import type { Asset, PayoutTransfer } from "@/lib/types/contracts";
import type { Transaction } from "@meshsdk/core";

export type StreamingPayoutBatch = "ada-only" | "native-only" | "empty";

type StreamingAdaPayout = {
  settlementLovelace: bigint;
  sinkAmount: Asset[] | null;
  outputAmounts: Asset[][];
};

export function resolveStreamingAdaPayoutTopUp(payout: StreamingAdaPayout) {
  return payout.outputAmounts.reduce(
    (total, amount) => total + getLovelaceQuantity(amount),
    0n
  ) - payout.settlementLovelace;
}

export function resolveStreamingAdaPayoutTotal(payout: StreamingAdaPayout) {
  return payout.outputAmounts.reduce(
    (total, amount) => total + getLovelaceQuantity(amount),
    0n
  );
}

export function classifyStreamingPayoutBatch(
  transfers: PayoutTransfer[]
): StreamingPayoutBatch {
  const units = transfers.flatMap((transfer) =>
    transfer.amount
      .filter((asset) => BigInt(asset.quantity) !== 0n)
      .map((asset) => asset.unit)
  );
  const hasAda = units.some((unit) => unit === "lovelace" || unit === "");
  const hasNativeAsset = units.some(
    (unit) => unit !== "lovelace" && unit !== ""
  );

  if (hasAda && hasNativeAsset) {
    throw new Error(
      "Streaming payment payouts cannot mix ADA and native assets in one transaction. Build separate transactions for the ADA and native-asset payouts."
    );
  }
  if (hasAda) return "ada-only";
  if (hasNativeAsset) return "native-only";
  return "empty";
}

export function createStreamingPayoutBuild(batch: StreamingPayoutBatch) {
  let sinkAmount: Asset[] | null = null;
  let sinkMinimumLovelace = 0n;
  const adaPayout: StreamingAdaPayout = {
    settlementLovelace: 0n,
    sinkAmount: null,
    outputAmounts: []
  };
  const excludedInputRefs = new Set<string>();
  const selector =
    batch === "ada-only"
      ? createNoChangeAdaSelector({
          resolveSinkOutputIndex: (outputs) =>
            outputs.findIndex((output) => output.amount === sinkAmount),
          excludedInputRefs: () => excludedInputRefs
        })
      : undefined;

  return {
    setupOptions: selector
      ? { selector, excludedSelectionInputRefs: excludedInputRefs }
      : undefined,
    sendTransfer(tx: Transaction, transfer: PayoutTransfer) {
      const output = sendAssetsWithOptionalInlineDatumAndReferenceScript(
        tx,
        transfer.address,
        transfer.amount,
        transfer.inlineDatum
      );
      if (batch !== "empty") {
        adaPayout.settlementLovelace += getLovelaceQuantity(transfer.amount);
        adaPayout.outputAmounts.push(output.amount);
      }
      if (
        batch === "ada-only" &&
        sinkAmount === null &&
        transfer.amount.some(
          (asset) => asset.unit === "lovelace" || asset.unit === ""
        )
      ) {
        sinkAmount = output.amount;
        sinkMinimumLovelace = getLovelaceQuantity(output.amount);
        adaPayout.sinkAmount = output.amount;
      }
    },
    resolveAdjustableOutput(tx: Transaction): AdjustableLovelaceOutput {
      const outputs = (tx.txBuilder as RuntimeTxBuilder).meshTxBuilderBody.outputs ?? [];
      const outputIndex = outputs.findIndex((output) => output.amount === sinkAmount);
      if (outputIndex < 0) {
        throw new Error(
          "ADA payout change sink is missing from the final transaction outputs."
        );
      }
      return {
        outputIndex,
        minimumLovelace: sinkMinimumLovelace,
        requireNoAppendedOutputs: true
      };
    },
    adaPayout
  };
}
