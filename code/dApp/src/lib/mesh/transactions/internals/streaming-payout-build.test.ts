import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createStreamingPayoutBuild,
  resolveStreamingAdaPayoutTopUp,
  resolveStreamingAdaPayoutTotal
} from "@/lib/mesh/transactions/internals/streaming-payout-build";
import type { RuntimeTxBuilder } from "@/lib/mesh/transactions/internals/budget-runtime-builder";
import type { ConstrData, PayoutTransfer } from "@/lib/types/contracts";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { MeshTxBuilder, type Transaction } from "@meshsdk/core";

const PAYOUT_ADDRESS =
  "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59";
const PAYOUT_TAG: ConstrData = {
  alternative: 0,
  fields: [1, "00".repeat(32), 0]
};

test("ADA payout output adds min-UTxO without changing settlement delta", () => {
  const transfer: PayoutTransfer = {
    address: PAYOUT_ADDRESS,
    amount: [{ unit: "lovelace", quantity: "300000" }],
    inlineDatum: PAYOUT_TAG
  };
  const builder = new MeshTxBuilder();
  builder.protocolParams(DEFAULT_PROTOCOL_PARAMETERS);
  const tx = { txBuilder: builder } as unknown as Transaction;
  const payoutBuild = createStreamingPayoutBuild("ada-only");

  payoutBuild.sendTransfer(tx, transfer);
  (builder as RuntimeTxBuilder).queueAllLastItem?.();

  const output = builder.meshTxBuilderBody.outputs[0]!;
  const outputLovelace = BigInt(
    output.amount.find((asset) => asset.unit === "lovelace")!.quantity
  );
  assert.equal(transfer.amount[0]!.quantity, "300000");
  assert.ok(outputLovelace > 300_000n);
  assert.deepEqual(payoutBuild.resolveAdjustableOutput(tx), {
    outputIndex: 0,
    minimumLovelace: outputLovelace,
    requireNoAppendedOutputs: true
  });
  assert.equal(
    resolveStreamingAdaPayoutTopUp(payoutBuild.adaPayout),
    outputLovelace - 300_000n
  );
});

test("ADA payout top-up totals every tagged output in a batch", () => {
  const builder = new MeshTxBuilder();
  builder.protocolParams(DEFAULT_PROTOCOL_PARAMETERS);
  const tx = { txBuilder: builder } as unknown as Transaction;
  const payoutBuild = createStreamingPayoutBuild("ada-only");

  for (const quantity of ["300000", "400000"]) {
    payoutBuild.sendTransfer(tx, {
      address: PAYOUT_ADDRESS,
      amount: [{ unit: "lovelace", quantity }],
      inlineDatum: PAYOUT_TAG
    });
  }
  (builder as RuntimeTxBuilder).queueAllLastItem?.();

  const outputTotal = builder.meshTxBuilderBody.outputs.reduce(
    (total, output) =>
      total + BigInt(output.amount.find((asset) => asset.unit === "lovelace")!.quantity),
    0n
  );
  assert.equal(payoutBuild.adaPayout.settlementLovelace, 700_000n);
  assert.equal(resolveStreamingAdaPayoutTotal(payoutBuild.adaPayout), outputTotal);
  assert.equal(
    resolveStreamingAdaPayoutTopUp(payoutBuild.adaPayout),
    outputTotal - 700_000n
  );
});

test("native-token payout tracks the min-UTxO ADA funded by the connected wallet", () => {
  const builder = new MeshTxBuilder();
  builder.protocolParams(DEFAULT_PROTOCOL_PARAMETERS);
  const tx = { txBuilder: builder } as unknown as Transaction;
  const payoutBuild = createStreamingPayoutBuild("native-only");

  payoutBuild.sendTransfer(tx, {
    address: PAYOUT_ADDRESS,
    amount: [{ unit: `${"ab".repeat(28)}01`, quantity: "10" }],
    inlineDatum: PAYOUT_TAG
  });
  (builder as RuntimeTxBuilder).queueAllLastItem?.();

  const outputLovelace = BigInt(
    builder.meshTxBuilderBody.outputs[0]!.amount.find(
      (asset) => asset.unit === "lovelace"
    )!.quantity
  );
  assert.ok(outputLovelace > 0n);
  assert.equal(payoutBuild.adaPayout.settlementLovelace, 0n);
  assert.equal(
    resolveStreamingAdaPayoutTopUp(payoutBuild.adaPayout),
    outputLovelace
  );
});
