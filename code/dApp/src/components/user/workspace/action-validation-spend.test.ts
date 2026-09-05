import assert from "node:assert/strict";
import { test } from "node:test";

import type { FieldErrors } from "@/components/user/flow-types";
import {
  appendStreamingPaymentPayoutDraftErrors,
  minimumBeneficiaryWithdrawalTransferCount
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

test("streaming payout rejects more than one wallet-script input", () => {
  const errors: FieldErrors = {};
  appendStreamingPaymentPayoutDraftErrors(errors, {
    streamingPaymentPayoutRows: [payoutRow()],
    streamingPaymentPayoutTransfers: [PAYOUT],
    sttWalletInputs: [
      { txHash: "aa", outputIndex: 0 },
      { txHash: "bb", outputIndex: 0 }
    ]
  });

  assert.match(errors["Fund pools"]?.[0] ?? "", /at most one fund pool/i);
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

test("streaming payout rejects more than two positive schedule transfers", () => {
  const errors: FieldErrors = {};
  appendStreamingPaymentPayoutDraftErrors(errors, {
    streamingPaymentPayoutRows: [payoutRow(), payoutRow(), payoutRow()],
    streamingPaymentPayoutTransfers: [PAYOUT, PAYOUT, PAYOUT],
    sttWalletInputs: []
  });

  assert.match(
    errors["Scheduled payment payout"]?.[0] ?? "",
    /at most 2 scheduled payments/i
  );
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

test("terminal beneficiary recovery permits zero transfers only with no selected fund pool", () => {
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
    minimumBeneficiaryWithdrawalTransferCount(state, "aa".repeat(28), 0),
    0
  );
  assert.equal(
    minimumBeneficiaryWithdrawalTransferCount(state, "aa".repeat(28), 1),
    1
  );
});

test("nonterminal beneficiary withdrawal still requires a transfer", () => {
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
    minimumBeneficiaryWithdrawalTransferCount(state, "aa".repeat(28), 0),
    1
  );
});
