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
      endDate: `${endDate}`
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
  assert.deepEqual(outputForm.lastPermissionlessPayoutAt, inputForm.lastPermissionlessPayoutAt);
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
