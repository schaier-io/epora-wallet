import assert from "node:assert/strict";
import { test } from "node:test";
import { initialAdminState } from "../lib/state.mjs";

const ADMIN_HASH = "aa".repeat(28);

test("initialAdminState builds a reachable admin-only State", () => {
  const state = initialAdminState({
    adminPaymentKeyHash: ADMIN_HASH,
    walletName: "Test wallet",
  });

  assert.equal(state.alternative, 0);
  assert.equal(state.fields.length, 6);

  const [access, proofOfLife, streamingPayments, walletName, intendedStake, payoutStamp] =
    state.fields;
  assert.deepEqual(access.fields[0][0].fields[1], [ADMIN_HASH]);
  assert.deepEqual(access.fields[2], [], "admin-only bootstrap must not create inert beneficiaries");
  assert.deepEqual(proofOfLife.fields, [
    { alternative: 1, fields: [] },
    { alternative: 1, fields: [] },
  ]);
  assert.deepEqual(streamingPayments, []);
  assert.equal(Buffer.from(walletName, "hex").toString("utf8"), "Test wallet");
  assert.deepEqual(intendedStake, { alternative: 1, fields: [] });
  assert.deepEqual(payoutStamp, { alternative: 1, fields: [] });
});

test("initialAdminState rejects malformed ledger hashes", () => {
  assert.throws(
    () => initialAdminState({ adminPaymentKeyHash: "aa" }),
    /28-byte Cardano credential hash/,
  );
  assert.throws(
    () => initialAdminState({ adminPaymentKeyHash: "zz".repeat(28) }),
    /28-byte Cardano credential hash/,
  );
});
