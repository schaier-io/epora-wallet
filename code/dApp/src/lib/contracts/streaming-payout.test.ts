import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultStateForm,
  stateFormToDatum,
  stateFormFromDatum,
  type StateFormState
} from "@/lib/contracts/state-form";
import { buildStateActionData } from "@/lib/contracts/action-data";
import { deriveStreamingPaymentPayoutStateDatum } from "@/lib/contracts/streaming-payout";
import { buildStreamingPaymentPayoutTransfer } from "@/lib/user-flow/guided-helpers";
import type { PayoutTransfer } from "@/lib/types/contracts";

const PAYOUT_ACTION = buildStateActionData({ kind: "streaming-payment-payout" });
const TX_LATEST_MS = 1_750_000_000_000;
const TEST_PAYOUT_ADDRESS =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";

function makeStateFormWithStreamingPayment(paidOutAmount = "0"): StateFormState {
  const form = createDefaultStateForm();
  form.streamingPayments = [
    {
      id: "7",
      payoutAddress: TEST_PAYOUT_ADDRESS,
      paidOutAmount,
      policyId: "",
      assetName: "",
      amountPerDay: "1000000",
      startDate: "0",
      endDate: "8640000000"
    }
  ];
  return form;
}

function makePayoutTransfer(quantity: string): PayoutTransfer {
  return buildStreamingPaymentPayoutTransfer(
    makeStateFormWithStreamingPayment().streamingPayments[0]!,
    quantity,
    "deadbeef",
    0
  );
}

test("payout advances paid_out_amount and stamps the cooldown clock", () => {
  const inputDatum = stateFormToDatum(makeStateFormWithStreamingPayment("500"), PAYOUT_ACTION);
  const { payoutDelta, outputDatum } = deriveStreamingPaymentPayoutStateDatum(
    inputDatum,
    [makePayoutTransfer("1500")],
    TX_LATEST_MS
  );

  assert.deepEqual(payoutDelta, [{ unit: "lovelace", quantity: "1500" }]);

  const outputForm = stateFormFromDatum(outputDatum);
  assert.equal(outputForm.streamingPayments[0]?.paidOutAmount, "2000");
  // Permissionless crank must stamp last_non_admin_payout_at = Some(tx_latest).
  assert.deepEqual(outputForm.lastNonAdminPayoutAt, {
    alternative: 0,
    fields: [TX_LATEST_MS]
  });
});

test("authorized crank preserves the cooldown stamp (ADR-0009 bypass branch)", () => {
  const inputForm = makeStateFormWithStreamingPayment();
  const inputDatum = stateFormToDatum(inputForm, PAYOUT_ACTION);
  const { outputDatum } = deriveStreamingPaymentPayoutStateDatum(
    inputDatum,
    [makePayoutTransfer("1000")],
    TX_LATEST_MS,
    true
  );

  const outputForm = stateFormFromDatum(outputDatum);
  // Input state had None — the bypass branch must leave it exactly unchanged.
  assert.deepEqual(outputForm.lastNonAdminPayoutAt, inputForm.lastNonAdminPayoutAt);
});

test("payout preserves wallet name and every non-streaming state field", () => {
  const inputForm = makeStateFormWithStreamingPayment();
  inputForm.walletName = "Family wallet";
  const inputDatum = stateFormToDatum(inputForm, PAYOUT_ACTION);
  const { outputDatum } = deriveStreamingPaymentPayoutStateDatum(
    inputDatum,
    [makePayoutTransfer("1")],
    TX_LATEST_MS
  );

  const outputForm = stateFormFromDatum(outputDatum);
  assert.equal(outputForm.walletName, "Family wallet");
  assert.deepEqual(outputForm.users, inputForm.users);
  assert.deepEqual(outputForm.beneficiaries, inputForm.beneficiaries);
  assert.deepEqual(outputForm.intendedStakeCredential, inputForm.intendedStakeCredential);
});

test("payout rejects transfers paying the wrong unit or unknown schedule ids", () => {
  const inputDatum = stateFormToDatum(makeStateFormWithStreamingPayment(), PAYOUT_ACTION);

  const wrongUnit = makePayoutTransfer("1000");
  wrongUnit.amount = [{ unit: "ff".repeat(28) + "5553444d", quantity: "1000" }];
  assert.throws(
    () => deriveStreamingPaymentPayoutStateDatum(inputDatum, [wrongUnit], TX_LATEST_MS),
    /can only pay lovelace/
  );

  const unknownId = makePayoutTransfer("1000");
  unknownId.inlineDatum = { alternative: 0, fields: [99, "deadbeef", 0] };
  assert.throws(
    () => deriveStreamingPaymentPayoutStateDatum(inputDatum, [unknownId], TX_LATEST_MS),
    /unknown streaming payment id 99/
  );

  assert.throws(
    () => deriveStreamingPaymentPayoutStateDatum(inputDatum, [], TX_LATEST_MS),
    /at least one tagged payout transfer/
  );
});
