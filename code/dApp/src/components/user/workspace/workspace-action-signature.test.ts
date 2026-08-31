import assert from "node:assert/strict";
import test from "node:test";

import {
  computeActionSignature,
  type BuildActionSignatureCtx
} from "@/components/user/workspace/workspace-action-signature";
import { prepareStreamingPaymentPayout } from "@/components/user/workspace/workspace-payout-preparation";
import { EMPTY_CONTRACT_CONFIG, type PayoutTransfer } from "@/lib/types/contracts";

function payoutTransfer(quantity: string): PayoutTransfer {
  return {
    address: "addr_test1vrpayout",
    amount: [{ unit: "lovelace", quantity }],
    inlineDatum: {
      alternative: 0,
      fields: [7, "a".repeat(64), 0]
    }
  };
}

function payoutContext(quantity: string): BuildActionSignatureCtx {
  return {
    activePaymentKeyHash: "payment-key-hash",
    config: EMPTY_CONTRACT_CONFIG,
    selectedDetectedToken: null,
    selectedDetectedTokenStateForm: null,
    sttAuthorityPath: "admin",
    sttExtraTransfers: [],
    sttInputOutputIndex: "0",
    sttInputTxHash: "a".repeat(64),
    sttOutputAssets: [],
    sttProofOfLifeOverrideMode: "unchanged",
    sttProofOfLifeSpecificDateTime: "",
    sttStateForm: {},
    sttWalletInputs: [],
    sttWalletOutputs: [],
    sttZeroAdminConfirmed: false,
    streamingPaymentPayout: prepareStreamingPaymentPayout([payoutTransfer(quantity)])
  } as unknown as BuildActionSignatureCtx;
}

test("scheduled payout amount changes invalidate the built preview signature", () => {
  const firstSignature = computeActionSignature(
    "payout-streaming-payment",
    payoutContext("1000000")
  );
  const changedSignature = computeActionSignature(
    "payout-streaming-payment",
    payoutContext("2000000")
  );

  assert.notEqual(changedSignature, firstSignature);
});

test("scheduled payout transfers do not affect other STT action signatures", () => {
  const firstSignature = computeActionSignature("use", payoutContext("1000000"));
  const changedSignature = computeActionSignature("use", payoutContext("2000000"));

  assert.equal(changedSignature, firstSignature);
});
