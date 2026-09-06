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

export type StreamingPayoutBatch = "ada-only" | "native-only" | "mixed" | "empty";

type StreamingAdaPayout = {
  settlementLovelace: bigint;
  sinkAmount: Asset[] | null;
  outputs: Array<{
    address: string;
    settlementLovelace: bigint;
    amount: Asset[];
  }>;
};

export function resolveStreamingAdaPayoutTopUp(payout: StreamingAdaPayout) {
  return payout.outputs.reduce(
    (total, output) => total + getLovelaceQuantity(output.amount),
    0n
  ) - payout.settlementLovelace;
}

export function resolveStreamingAdaPayoutTotal(payout: StreamingAdaPayout) {
  return payout.outputs.reduce(
    (total, output) => total + getLovelaceQuantity(output.amount),
    0n
  );
}

export function resolveStreamingAdaPayoutTopUps(payout: StreamingAdaPayout) {
  return payout.outputs.flatMap((output) => {
    const finalOutputLovelace = getLovelaceQuantity(output.amount);
    const topUpLovelace = finalOutputLovelace - output.settlementLovelace;
    return topUpLovelace > 0n
      ? [{
          address: output.address,
          settlementLovelace: output.settlementLovelace,
          finalOutputLovelace,
          topUpLovelace
        }]
      : [];
  });
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

  if (hasAda && hasNativeAsset) return "mixed";
  if (hasAda) return "ada-only";
  if (hasNativeAsset) return "native-only";
  return "empty";
}

export function createStreamingPayoutBuild(
  batch: StreamingPayoutBatch,
  hasWalletInputs = false
) {
  // An ADA payout that spends the wallet script cannot leave ordinary ADA
  // change. The validator treats every non-protocol ADA output as payout value
  // and requires its matching payout tag. Absorb funding change into one tagged
  // ADA output instead. Without a wallet-script input, ordinary change is safe.
  const absorbsFundingChange =
    hasWalletInputs && (batch === "ada-only" || batch === "mixed");
  let sinkAmount: Asset[] | null = null;
  let sinkMinimumLovelace = 0n;
  const adaPayout: StreamingAdaPayout = {
    settlementLovelace: 0n,
    sinkAmount: null,
    outputs: []
  };
  const excludedInputRefs = new Set<string>();
  const selector =
    absorbsFundingChange
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
        const settlementLovelace = getLovelaceQuantity(transfer.amount);
        adaPayout.settlementLovelace += settlementLovelace;
        adaPayout.outputs.push({
          address: transfer.address,
          settlementLovelace,
          amount: output.amount
        });
      }
      if (
        absorbsFundingChange &&
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
    adaPayout,
    absorbsFundingChange
  };
}
