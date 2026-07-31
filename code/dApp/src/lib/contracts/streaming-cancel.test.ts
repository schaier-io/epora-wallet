import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createDefaultStateForm,
  stateFormFromDatum,
  stateFormToDatum,
  type StateFormState
} from "@/lib/contracts/state-form";
import type { ConstrData } from "@/lib/types/contracts";
import { deriveStreamingPaymentCancellationStateDatum } from "@/lib/contracts/streaming-cancel";
import { deriveStreamingPaymentPayoutStateDatum } from "@/lib/contracts/streaming-payout";

const TX_EARLIEST_MS = 1_750_000_000_000;
const TX_LATEST_MS = TX_EARLIEST_MS + 240_000;
const TEST_PAYOUT_ADDRESS =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";

function some(value: number): ConstrData {
  return { alternative: 0, fields: [value] };
}

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

test("receiver cancel shortens the target to the tx upper bound and stamps the shared clock", () => {
  const inputForm = makeForm(TX_LATEST_MS + 86_400_000);
  inputForm.walletName = "Family wallet";
  const inputDatum = stateFormToDatum(inputForm);

  const { outputDatum } = deriveStreamingPaymentCancellationStateDatum(
    inputDatum,
    7,
    TX_EARLIEST_MS,
    TX_LATEST_MS
  );
  const outputForm = stateFormFromDatum(outputDatum);

  assert.equal(outputForm.streamingPayments[0]?.endDate, `${TX_LATEST_MS}`);
  assert.equal(outputForm.walletName, "Family wallet");
  assert.equal(outputForm.streamingPayments[0]?.paidOutAmount, "0");
  assert.deepEqual(outputForm.lastNonAdminPayoutAt, some(TX_LATEST_MS));
  assert.deepEqual(outputForm.users, inputForm.users);
  assert.deepEqual(outputForm.beneficiaries, inputForm.beneficiaries);
  assert.deepEqual(outputForm.intendedStakeCredential, inputForm.intendedStakeCredential);
});

test("receiver cancel rejects a schedule too close to the safe validity upper bound", () => {
  const inputDatum = stateFormToDatum(makeForm(TX_LATEST_MS));
  assert.throws(
    () =>
      deriveStreamingPaymentCancellationStateDatum(
        inputDatum,
        7,
        TX_EARLIEST_MS,
        TX_LATEST_MS
      ),
    /ends too soon to shorten/
  );
});

test("receiver cancel rejects unknown streaming payment ids", () => {
  const inputDatum = stateFormToDatum(makeForm(TX_LATEST_MS + 1));
  assert.throws(
    () =>
      deriveStreamingPaymentCancellationStateDatum(
        inputDatum,
        99,
        TX_EARLIEST_MS,
        TX_LATEST_MS
      ),
    /unknown streaming payment id 99/
  );
});

test("receiver cancel enforces the shared 30-minute cooldown", () => {
  const form = makeForm(TX_LATEST_MS + 86_400_000);
  form.lastNonAdminPayoutAt = some(TX_EARLIEST_MS - 1_000_000);
  const inputDatum = stateFormToDatum(form);

  assert.throws(
    () =>
      deriveStreamingPaymentCancellationStateDatum(
        inputDatum,
        7,
        TX_EARLIEST_MS,
        TX_LATEST_MS
      ),
    /shared 30-minute receiver\/payout cooldown/
  );
});

test("receiver cancel rejects a validity window wider than one hour", () => {
  const inputDatum = stateFormToDatum(makeForm(TX_LATEST_MS + 86_400_000));
  assert.throws(
    () =>
      deriveStreamingPaymentCancellationStateDatum(
        inputDatum,
        7,
        TX_EARLIEST_MS,
        TX_EARLIEST_MS + 3_600_001
      ),
    /cannot exceed 60 minutes/
  );
});

test("pre-start receiver cancel creates a zero-lifetime high-rate schedule that payout removes", () => {
  const form = makeForm(TX_LATEST_MS + 2 * 86_400_000);
  form.streamingPayments[0]!.startDate = `${TX_LATEST_MS + 86_400_000}`;
  form.streamingPayments[0]!.amountPerDay = "86400000000000";
  const inputDatum = stateFormToDatum(form);

  const { outputDatum } = deriveStreamingPaymentCancellationStateDatum(
    inputDatum,
    7,
    TX_EARLIEST_MS,
    TX_LATEST_MS
  );
  const output = stateFormFromDatum(outputDatum).streamingPayments[0]!;

  assert.equal(output.endDate, output.startDate);

  const settlementTime = Number(output.endDate);
  const settled = deriveStreamingPaymentPayoutStateDatum(
    outputDatum,
    [],
    settlementTime,
    settlementTime + 1,
    true
  );
  assert.deepEqual(settled.removedStreamingPaymentIds, [7]);
  assert.deepEqual(stateFormFromDatum(settled.outputDatum).streamingPayments, []);
});
