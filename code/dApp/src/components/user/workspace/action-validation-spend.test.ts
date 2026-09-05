import assert from "node:assert/strict";
import { test } from "node:test";

import type { FieldErrors } from "@/components/user/flow-types";
import {
  appendStreamingPaymentPayoutDraftErrors,
  minimumBeneficiaryWithdrawalWalletInputCount
} from "@/components/user/workspace/action-validation-spend";
import { createDefaultStateForm } from "@/lib/contracts/state-form";
import type { PayoutTransfer } from "@/lib/types/contracts";

const PAYOUT: PayoutTransfer = {
  address: "addr_test1payee",
  amount: [{ unit: "lovelace", quantity: "1" }],
  inlineDatum: { alternative: 0, fields: [7, "deadbeef", 0] }
};

function payoutRow(cleanupRequired = false) {
  return {
    cleanupRequired,
    configuredAmount: cleanupRequired ? "0" : "1",
    dueAmount: cleanupRequired ? "0" : "1",
    streamingPayment: { id: "7" }
  };
}

test("streaming payout permits external funding with zero wallet-script inputs", () => {
  const errors: FieldErrors = {};
  appendStreamingPaymentPayoutDraftErrors(errors, {
    streamingPaymentPayoutRows: [payoutRow()],
    streamingPaymentPayoutTransfers: [PAYOUT],
    sttWalletInputs: []
  });

  assert.deepEqual(errors, {});
});

test("streaming payout accepts multiple wallet-script inputs", () => {
  const errors: FieldErrors = {};
  appendStreamingPaymentPayoutDraftErrors(errors, {
    streamingPaymentPayoutRows: [payoutRow()],
    streamingPaymentPayoutTransfers: [PAYOUT],
    sttWalletInputs: [
      { txHash: "aa", outputIndex: 0 },
      { txHash: "bb", outputIndex: 0 }
    ]
  });

  assert.deepEqual(errors, {});
});

test("streaming payout permits zero-transfer cleanup of a settled schedule", () => {
  const errors: FieldErrors = {};
  appendStreamingPaymentPayoutDraftErrors(errors, {
    streamingPaymentPayoutRows: [payoutRow(true)],
    streamingPaymentPayoutTransfers: [],
    sttWalletInputs: []
  });

  assert.deepEqual(errors, {});
});

test("streaming payout accepts every selected positive schedule transfer", () => {
  const errors: FieldErrors = {};
  appendStreamingPaymentPayoutDraftErrors(errors, {
    streamingPaymentPayoutRows: [payoutRow(), payoutRow(), payoutRow()],
    streamingPaymentPayoutTransfers: [PAYOUT, PAYOUT, PAYOUT],
    sttWalletInputs: []
  });

  assert.deepEqual(errors, {});
});

test("streaming payout still requires value movement or cleanup", () => {
  const errors: FieldErrors = {};
  appendStreamingPaymentPayoutDraftErrors(errors, {
    streamingPaymentPayoutRows: [payoutRow()],
    streamingPaymentPayoutTransfers: [],
    sttWalletInputs: []
  });

  assert.match(errors["Scheduled payment payout"]?.[0] ?? "", /clean up/);
});

test("streaming payout names a bad row by its position, not its on-chain id", () => {
  const errors: FieldErrors = {};
  appendStreamingPaymentPayoutDraftErrors(errors, {
    streamingPaymentPayoutRows: [{ ...payoutRow(), configuredAmount: "abc" }],
    streamingPaymentPayoutTransfers: [PAYOUT],
    sttWalletInputs: []
  });

  assert.match(errors["Scheduled payment 1"]?.[0] ?? "", /whole-number/i);
  assert.equal(errors["Scheduled payment 7"], undefined);
});

test("final beneficiary recovery requires at least one selected fund pool", () => {
  const state = createDefaultStateForm();
  state.beneficiaries = [
    {
      id: "7",
      wallets: ["aa".repeat(28)],
      unlockAfterMode: "none",
      unlockAfter: "",
      weight: "1"
    }
  ];

  assert.equal(
    minimumBeneficiaryWithdrawalWalletInputCount(state),
    1
  );
});

test("earlier beneficiary withdrawal keeps the fund pool optional", () => {
  const state = createDefaultStateForm();
  state.beneficiaries = [
    {
      id: "7",
      wallets: ["aa".repeat(28)],
      unlockAfterMode: "none",
      unlockAfter: "",
      weight: "1"
    },
    {
      id: "8",
      wallets: ["bb".repeat(28)],
      unlockAfterMode: "none",
      unlockAfter: "",
      weight: "1"
    }
  ];

  assert.equal(
    minimumBeneficiaryWithdrawalWalletInputCount(state),
    0
  );
});
