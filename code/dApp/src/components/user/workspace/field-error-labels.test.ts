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
});

// The validators key FieldErrors by the field's default-English label
// (action-validation-*.ts), so those strings are what the review rail receives.
test("field-error labels resolve the keys the validators emit", () => {
  assert.equal(
    getFieldErrorLabel("Transfers / forwarded outputs", translate),
    "translated:fieldDestinations"
  );
  assert.equal(
    getFieldErrorLabel("STT input tx hash", translate),
    "translated:fieldWalletIdentity"
  );
  assert.equal(
    getFieldErrorLabel("Scheduled payment payout", translate),
    "translated:fieldScheduledPayments"
  );
  // One key per payout row; the exact "Scheduled payment payout" key above must
  // not be swallowed by this prefix.
  assert.equal(
    getFieldErrorLabel("Scheduled payment 3", translate),
    "translated:fieldScheduledPayment"
  );
});

test("unknown field keys fall back to the raw key", () => {
  assert.equal(getFieldErrorLabel("futureField", translate), "futureField");
});
