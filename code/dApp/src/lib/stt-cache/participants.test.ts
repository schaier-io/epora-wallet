import assert from "node:assert/strict";
import test from "node:test";
import { getSttScriptAddress } from "@/lib/stt-cache/domain";
import {
  TEST_CONNECTED_ADDRESS,
  TEST_CONNECTED_PAYMENT_KEY_HASH,
  createSttFixture
} from "@/lib/stt-cache/test-helpers";
import { projectParticipantsFromDatum } from "@/lib/stt-cache/participants";

test("projectParticipantsFromDatum indexes hashes for users and beneficiaries and raw addresses for streaming payments", () => {
  const fixture = createSttFixture();
  const participants = projectParticipantsFromDatum(fixture.datum);
  const adminUser = participants.find(
    (participant) =>
      participant.role === "ADMIN_USER" &&
      participant.paymentKeyHash === TEST_CONNECTED_PAYMENT_KEY_HASH
  );
  const beneficiary = participants.find(
    (participant) =>
      participant.role === "BENEFICIARY" &&
      participant.paymentKeyHash === TEST_CONNECTED_PAYMENT_KEY_HASH
  );
  const streamingPaymentRecipient = participants.find(
    (participant) =>
      participant.role === "STREAMING_PAYMENT_RECIPIENT" &&
      participant.sourceAddress === TEST_CONNECTED_ADDRESS
  );
  const scriptStreamingPayment = participants.find(
    (participant) =>
      participant.role === "STREAMING_PAYMENT_RECIPIENT" &&
      participant.sourceAddress === getSttScriptAddress()
  );

  assert.ok(adminUser);
  assert.ok(beneficiary);
  assert.ok(streamingPaymentRecipient);
  assert.equal(streamingPaymentRecipient?.paymentKeyHash, TEST_CONNECTED_PAYMENT_KEY_HASH);
  assert.ok(scriptStreamingPayment);
  assert.equal(scriptStreamingPayment?.paymentKeyHash, null);
  assert.ok(scriptStreamingPayment?.scriptHash);
});
