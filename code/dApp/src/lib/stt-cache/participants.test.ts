import assert from "node:assert/strict";
import test from "node:test";
import { getSttScriptAddress } from "@/lib/stt-cache/domain";
import {
  TEST_CONNECTED_ADDRESS,
  TEST_CONNECTED_PAYMENT_KEY_HASH,
  createSttFixture
} from "@/lib/stt-cache/test-helpers";
import { projectParticipantsFromDatum } from "@/lib/stt-cache/participants";
import {
  stateFormFromDatum,
  stateFormToDatum
} from "@/lib/contracts/state-form";
import { MAX_ON_CHAIN_STATE_INTEGER } from "@/lib/contracts/on-chain-integer";

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

test("projectParticipantsFromDatum keeps uint64 participant keys distinct without overflowing PostgreSQL integers", () => {
  const fixture = createSttFixture();
  const form = stateFormFromDatum(fixture.datum);
  const regularUser = form.users.find((user) => !user.isAdmin);
  assert.ok(regularUser);

  const ids = [
    "2147483647",
    "2147483648",
    (MAX_ON_CHAIN_STATE_INTEGER - 1n).toString(),
    MAX_ON_CHAIN_STATE_INTEGER.toString()
  ];
  form.users = ids.map((id) => ({ ...regularUser, id }));

  const users = projectParticipantsFromDatum(stateFormToDatum(form)).filter(
    (participant) => participant.role === "USER"
  );

  assert.deepEqual(
    users.map((participant) => participant.onChainId),
    [2_147_483_647, null, null, null]
  );
  assert.equal(new Set(users.map((participant) => participant.participantKey)).size, 4);
  assert.deepEqual(
    users.map((participant) => participant.participantKey.split(":", 2)[1]),
    ids
  );
});
