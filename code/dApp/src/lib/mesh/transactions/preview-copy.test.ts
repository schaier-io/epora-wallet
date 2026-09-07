import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatConsolidationPreview,
  formatGovernancePreview,
  formatReferenceScriptUsage,
  formatRewardWithdrawalPreview,
  formatStakeCredentialPreview,
  formatWalletSpendPreview
} from "@/lib/mesh/transactions/preview-copy";

test("a preview says how many reference scripts the transaction uses", () => {
  const usage = formatReferenceScriptUsage(2);

  assert.equal(usage, " using 2 reference scripts");
  assert.match(formatWalletSpendPreview(usage), /using 2 reference scripts\.$/);
  assert.match(formatConsolidationPreview(3, 1, usage), /using 2 reference scripts\.$/);
  assert.match(formatGovernancePreview("vote", usage), /using 2 reference scripts\.$/);
  assert.match(formatStakeCredentialPreview("key", usage), /using 2 reference scripts\.$/);
  assert.match(
    formatRewardWithdrawalPreview("2500000", "stake_test1abc", usage),
    /using 2 reference scripts\.$/
  );
});

test("one reference script is counted in the singular", () => {
  assert.match(
    formatWalletSpendPreview(formatReferenceScriptUsage(1)),
    /using 1 reference script\.$/
  );
});

test("a transaction with no reference script reads as a plain sentence", () => {
  assert.equal(formatReferenceScriptUsage(0), "");
  assert.equal(
    formatWalletSpendPreview(formatReferenceScriptUsage(0)),
    "Spend funds from the selected smart-wallet fund pools."
  );
});
