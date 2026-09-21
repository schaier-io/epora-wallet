import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import { planPayeeStop } from "./payee-stop-plan";

const DAY_MS = 86_400_000;
const NOW = 1_760_000_000_000;
const WINDOW = { earliestTimeMs: NOW, latestTimeMs: NOW + 60_000 };
function state(startDate = NOW - DAY_MS, paidOutAmount = "1000000") {
  const form = createDefaultStateForm();
  form.streamingPayments = [{
    id: "7",
    payoutAddress: "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu",
    paidOutAmount, policyId: "", assetName: "", amountPerDay: "5000000",
    startDate: String(startDate), endDate: String(NOW + 3 * DAY_MS)
  }];
  return stateFormToDatum(form);
}

test("stop review uses the builder cutoff and subtracts payments already made", () => {
  assert.deepEqual(planPayeeStop(state(), 7, WINDOW), {
    cutoff: WINDOW.latestTimeMs, retainedDebt: "4003472", policyId: "", assetName: ""
  });
});

test("a future payment stops at its start with no debt", () => {
  assert.deepEqual(planPayeeStop(state(NOW + DAY_MS, "0"), 7, WINDOW), {
    cutoff: NOW + DAY_MS, retainedDebt: "0", policyId: "", assetName: ""
  });
});

test("unknown payment cannot produce an approvable review", () => {
  assert.throws(() => planPayeeStop(state(), 9, WINDOW), /unknown streaming payment/);
});
