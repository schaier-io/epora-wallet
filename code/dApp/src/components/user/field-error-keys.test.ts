import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIELD_ERROR_KEYS,
  describeFieldErrorKey,
  scheduledPaymentFieldErrorKey
} from "@/components/user/field-error-keys";

/**
 * These keys are identities, never copy. The defect that produced this module was the
 * opposite: a field error was filed under `i18n("outputState")` ("Wallet state after") and
 * read back with the literal `"Output state"`, so the inline error under the field never
 * appeared. Two guards keep that from returning: every identity must resolve to a label, and
 * no label may be the identity itself, which is what a reader would see on a missed key.
 */

test("every field-error identity has a label of its own", () => {
  for (const [messageKey, key] of Object.entries(FIELD_ERROR_KEYS)) {
    const label = describeFieldErrorKey(key);
    // A missing message makes next-intl hand back the message key, so that is the shape to
    // reject. Checking only `label !== key` passes on a missing message and proves nothing:
    // VERIFIED by deleting `outputState` from the catalog, which this assertion catches and
    // the slug comparison alone did not.
    assert.notEqual(label, messageKey, `"${key}" has no message of its own`);
    assert.notEqual(label, key, `"${key}" would show the reader its slug`);
    assert.doesNotMatch(label, /^[a-z0-9]+(-[a-z0-9]+)+$/, `"${key}" resolves to a slug`);
  }
});

test("a scheduled-payment row keeps its position in the label", () => {
  const key = scheduledPaymentFieldErrorKey(3);
  assert.equal(key, "scheduled-payment-3");
  assert.equal(describeFieldErrorKey(key), "Scheduled payment 3");
});

test("an unknown key is shown as it stands", () => {
  // Zod files an issue under its own path when the schema has one. Showing that beats
  // showing nothing, so the describer passes anything it does not know straight through.
  assert.equal(describeFieldErrorKey("amount.0.quantity"), "amount.0.quantity");
});

test("the identities are distinct", () => {
  const values = Object.values(FIELD_ERROR_KEYS);
  assert.equal(new Set(values).size, values.length);
});
