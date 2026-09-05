import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultStateForm,
  stateFormToDatum,
  stateFormFromDatum,
  type StateFormState
} from "@/lib/contracts/state-form";
import { buildStateActionData } from "@/lib/contracts/action-data";
import {
  deriveStreamingPaymentPayoutStateDatum,
  retagStreamingPaymentPayoutTransfers
} from "@/lib/contracts/streaming-payout";
import { buildStreamingPaymentPayoutTransfer } from "@/lib/user-flow/guided-helpers";
import type { PayoutTransfer } from "@/lib/types/contracts";

const PAYOUT_ACTION = buildStateActionData({ kind: "streaming-payment-payout" });
const TX_EARLIEST_MS = 1_749_999_640_000;
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

test("retags payout outputs when stale STT discovery resolves the moved NFT", () => {
  const transfer = makePayoutTransfer("1000");
  const liveTxHash = "ab".repeat(32);
  const [retagged] = retagStreamingPaymentPayoutTransfers([transfer], liveTxHash, 3);

  assert.deepEqual(retagged?.inlineDatum?.fields, [7, liveTxHash, 3]);
  assert.deepEqual(transfer.inlineDatum?.fields, [7, "deadbeef", 0]);
});

test("payout advances paid_out_amount and stamps the cooldown clock", () => {
  const inputDatum = stateFormToDatum(makeStateFormWithStreamingPayment("500"), PAYOUT_ACTION);
  const { payoutDelta, outputDatum } = deriveStreamingPaymentPayoutStateDatum(
    inputDatum,
    [makePayoutTransfer("1500")],
    TX_EARLIEST_MS,
    TX_LATEST_MS
  );

  assert.deepEqual(payoutDelta, [{ unit: "lovelace", quantity: "1500" }]);

  const outputForm = stateFormFromDatum(outputDatum);
  assert.equal(outputForm.streamingPayments[0]?.paidOutAmount, "2000");
  // A NON-ADMIN crank must stamp last_non_admin_payout_at = Some(tx_latest).
  assert.deepEqual(outputForm.lastNonAdminPayoutAt, {
    alternative: 0,
    fields: [TX_LATEST_MS]
  });
});

test("admin crank preserves the cadence stamp (the only exempt branch)", () => {
  const inputForm = makeStateFormWithStreamingPayment();
  const inputDatum = stateFormToDatum(inputForm, PAYOUT_ACTION);
  const { outputDatum } = deriveStreamingPaymentPayoutStateDatum(
    inputDatum,
    [makePayoutTransfer("1000")],
    TX_EARLIEST_MS,
    TX_LATEST_MS,
    true
  );

  const outputForm = stateFormFromDatum(outputDatum);
  // Input state had None, so the bypass branch must leave it exactly unchanged.
  assert.deepEqual(outputForm.lastNonAdminPayoutAt, inputForm.lastNonAdminPayoutAt);
});

test("payout preserves wallet name and every non-streaming state field", () => {
  const inputForm = makeStateFormWithStreamingPayment();
  inputForm.walletName = "Family wallet";
  const inputDatum = stateFormToDatum(inputForm, PAYOUT_ACTION);
  const { outputDatum } = deriveStreamingPaymentPayoutStateDatum(
    inputDatum,
    [makePayoutTransfer("1")],
    TX_EARLIEST_MS,
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
    () =>
      deriveStreamingPaymentPayoutStateDatum(
        inputDatum,
        [wrongUnit],
        TX_EARLIEST_MS,
        TX_LATEST_MS
      ),
    /can only pay lovelace/
  );

  const unknownId = makePayoutTransfer("1000");
  unknownId.inlineDatum = { alternative: 0, fields: [99, "deadbeef", 0] };
  assert.throws(
    () =>
      deriveStreamingPaymentPayoutStateDatum(
        inputDatum,
        [unknownId],
        TX_EARLIEST_MS,
        TX_LATEST_MS
      ),
    /unknown streaming payment id 99/
  );

  assert.throws(
    () =>
      deriveStreamingPaymentPayoutStateDatum(
        inputDatum,
        [],
        TX_EARLIEST_MS,
        TX_LATEST_MS
      ),
    /tagged payout transfer or a fully settled entry/
  );
});

test("payout uses the transaction lower bound as its accrual ceiling", () => {
  const form = makeStateFormWithStreamingPayment();
  form.streamingPayments[0]!.amountPerDay = "86400000";
  form.streamingPayments[0]!.endDate = "10000000";
  const inputDatum = stateFormToDatum(form, PAYOUT_ACTION);

  assert.throws(
    () =>
      deriveStreamingPaymentPayoutStateDatum(
        inputDatum,
        [makePayoutTransfer("2000")],
        1000,
        2000
      ),
    /exceeds the amount accrued at the transaction lower bound/
  );

  const { outputDatum } = deriveStreamingPaymentPayoutStateDatum(
    inputDatum,
    [makePayoutTransfer("1000")],
    1000,
    2000
  );
  assert.equal(stateFormFromDatum(outputDatum).streamingPayments[0]?.paidOutAmount, "1000");
});

test("payout rejects more than two positive schedule transfers", () => {
  const inputDatum = stateFormToDatum(makeStateFormWithStreamingPayment(), PAYOUT_ACTION);
  const transfer = makePayoutTransfer("1");

  assert.throws(
    () =>
      deriveStreamingPaymentPayoutStateDatum(
        inputDatum,
        [transfer, transfer, transfer],
        TX_EARLIEST_MS,
        TX_LATEST_MS
      ),
    /at most 2 scheduled payments/
  );
});

test("full payout at maturity removes the settled entry", () => {
  const form = makeStateFormWithStreamingPayment("500000");
  form.streamingPayments[0]!.endDate = "86400000";
  const inputDatum = stateFormToDatum(form, PAYOUT_ACTION);

  const { outputDatum, payoutDelta, removedStreamingPaymentIds } =
    deriveStreamingPaymentPayoutStateDatum(
      inputDatum,
      [makePayoutTransfer("500000")],
      86400000,
      86401000
    );

  assert.deepEqual(payoutDelta, [{ unit: "lovelace", quantity: "500000" }]);
  assert.deepEqual(removedStreamingPaymentIds, [7]);
  assert.deepEqual(stateFormFromDatum(outputDatum).streamingPayments, []);
});

test("partial payout retains a matured entry", () => {
  const form = makeStateFormWithStreamingPayment("500000");
  form.streamingPayments[0]!.endDate = "86400000";
  const inputDatum = stateFormToDatum(form, PAYOUT_ACTION);

  const { outputDatum, removedStreamingPaymentIds } =
    deriveStreamingPaymentPayoutStateDatum(
      inputDatum,
      [makePayoutTransfer("250000")],
      86400000,
      86401000
    );

  assert.deepEqual(removedStreamingPaymentIds, []);
  assert.equal(stateFormFromDatum(outputDatum).streamingPayments[0]?.paidOutAmount, "750000");
});

test("zero-delta cleanup removes already-settled and zero-lifetime entries", () => {
  const form = makeStateFormWithStreamingPayment("100000000");
  form.streamingPayments.push({
    ...form.streamingPayments[0]!,
    id: "8",
    paidOutAmount: "0",
    amountPerDay: "0"
  });
  const inputDatum = stateFormToDatum(form, PAYOUT_ACTION);

  const { outputDatum, payoutDelta, removedStreamingPaymentIds } =
    deriveStreamingPaymentPayoutStateDatum(
      inputDatum,
      [],
      1,
      2
    );

  assert.deepEqual(payoutDelta, []);
  assert.deepEqual(removedStreamingPaymentIds, [7, 8]);
  assert.deepEqual(stateFormFromDatum(outputDatum).streamingPayments, []);
});

test("mixed payout removes final entries and retains partial entries", () => {
  const form = makeStateFormWithStreamingPayment("500000");
  form.streamingPayments[0]!.endDate = "86400000";
  form.streamingPayments.push({
    ...form.streamingPayments[0]!,
    id: "8",
    paidOutAmount: "0",
    endDate: "172800000"
  });
  form.streamingPayments.push({
    ...form.streamingPayments[0]!,
    id: "9",
    paidOutAmount: "1000000"
  });
  const inputDatum = stateFormToDatum(form, PAYOUT_ACTION);

  const finalTransfer = makePayoutTransfer("500000");
  const partialTransfer = makePayoutTransfer("250000");
  partialTransfer.inlineDatum = { alternative: 0, fields: [8, "deadbeef", 0] };
  const { outputDatum, removedStreamingPaymentIds } =
    deriveStreamingPaymentPayoutStateDatum(
      inputDatum,
      [finalTransfer, partialTransfer],
      86400000,
      86401000
    );

  const outputForm = stateFormFromDatum(outputDatum);
  assert.deepEqual(removedStreamingPaymentIds, [7, 9]);
  assert.deepEqual(outputForm.streamingPayments.map((entry) => entry.id), ["8"]);
  assert.equal(outputForm.streamingPayments[0]?.paidOutAmount, "250000");
});
