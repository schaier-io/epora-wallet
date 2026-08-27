import assert from "node:assert/strict";
import test from "node:test";
import { getFieldErrorLabel } from "./field-error-labels";

const translate = (key: string) => `translated:${key}`;

test("field-error labels hide stable implementation IDs", () => {
  assert.equal(
    getFieldErrorLabel("walletIdentityTransactionHash", translate),
    "translated:fieldWalletIdentity"
  );
  assert.equal(
    getFieldErrorLabel("scheduledPayment:7", translate),
    "translated:fieldScheduledPayment"
  );
  assert.equal(getFieldErrorLabel("futureField", translate), "translated:fieldForm");
});
