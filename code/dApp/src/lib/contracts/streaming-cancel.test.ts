import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultStateForm,
  stateFormToDatum,
  stateFormFromDatum,
  type StateFormState
} from "@/lib/contracts/state-form";
import { buildStateActionData } from "@/lib/contracts/action-data";
import { deriveStreamingPaymentCancellationStateDatum } from "@/lib/contracts/streaming-cancel";
import { deriveStreamingPaymentPayoutStateDatum } from "@/lib/contracts/streaming-payout";
import { LAST_NON_ADMIN_PAYOUT_AT_NONE } from "@/lib/contracts/state-layout";

const ACTION = buildStateActionData({ kind: "streaming-payment-payout" });
const NOW_MS = 1_750_000_000_000;
const TEST_PAYOUT_ADDRESS =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";

function makeForm(endDate: number, id = "7"): StateFormState {
  const form = createDefaultStateForm();
  form.streamingPayments = [
    {
      id,
      payoutAddress: TEST_PAYOUT_ADDRESS,
      paidOutAmount: "0",
      policyId: "",
      assetName: "",
      amountPerDay: "1000000",
      startDate: "0",
      endDate: `${endDate}`,
      cancelledAt: LAST_NON_ADMIN_PAYOUT_AT_NONE
    }
  ];
  return form;
}

test("cancel caps the target end_date at now and preserves everything else", () => {
  const inputForm = makeForm(NOW_MS + 86_400_000);
  inputForm.walletName = "Family wallet";
  const inputDatum = stateFormToDatum(inputForm, ACTION);

  const { outputDatum } = deriveStreamingPaymentCancellationStateDatum(inputDatum, 7, NOW_MS);
  const outputForm = stateFormFromDatum(outputDatum);

  assert.equal(outputForm.streamingPayments[0]?.endDate, `${NOW_MS}`);
  assert.equal(outputForm.walletName, "Family wallet");
  assert.equal(outputForm.streamingPayments[0]?.paidOutAmount, "0");
  assert.deepEqual(outputForm.streamingPayments[0]?.cancelledAt, {
    alternative: 0,
    fields: [NOW_MS]
  });
  assert.deepEqual(outputForm.lastNonAdminPayoutAt, inputForm.lastNonAdminPayoutAt);
});

test("cancel rejects a schedule that already ended — nothing to cancel", () => {
  const inputDatum = stateFormToDatum(makeForm(NOW_MS - 1), ACTION);
  assert.throws(
    () => deriveStreamingPaymentCancellationStateDatum(inputDatum, 7, NOW_MS),
    /nothing to cancel/
  );
});

test("cancel rejects unknown streaming payment ids", () => {
  const inputDatum = stateFormToDatum(makeForm(NOW_MS + 1), ACTION);
  assert.throws(
    () => deriveStreamingPaymentCancellationStateDatum(inputDatum, 99, NOW_MS),
    /unknown streaming payment id 99/
  );
});

test("cancel rejects a second attempt even with a lower future upper bound", () => {
  const inputDatum = stateFormToDatum(makeForm(NOW_MS + 86_400_000), ACTION);
  const first = deriveStreamingPaymentCancellationStateDatum(inputDatum, 7, NOW_MS + 60_000);

  assert.throws(
    () => deriveStreamingPaymentCancellationStateDatum(first.outputDatum, 7, NOW_MS + 30_000),
    /already been cancelled/
  );
});

test("pre-start cancel creates zero lifetime even for a high-rate schedule", () => {
  const form = makeForm(NOW_MS + 2 * 86_400_000);
  form.streamingPayments[0]!.startDate = `${NOW_MS + 86_400_000}`;
  form.streamingPayments[0]!.amountPerDay = "86400000000000";
  const inputDatum = stateFormToDatum(form, ACTION);

  const { outputDatum } = deriveStreamingPaymentCancellationStateDatum(inputDatum, 7, NOW_MS);
  const output = stateFormFromDatum(outputDatum).streamingPayments[0]!;

  assert.equal(output.endDate, output.startDate);
  assert.deepEqual(output.cancelledAt, { alternative: 0, fields: [NOW_MS] });

  const settled = deriveStreamingPaymentPayoutStateDatum(
    outputDatum,
    [],
    NOW_MS + 86_400_000,
    NOW_MS + 86_400_001,
    true
  );
  assert.deepEqual(settled.removedStreamingPaymentIds, [7]);
  assert.deepEqual(stateFormFromDatum(settled.outputDatum).streamingPayments, []);
});
