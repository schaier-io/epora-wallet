import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCloseTransaction,
  buildForwardTransaction,
  createSttFixture
} from "@/lib/stt-cache/test-helpers";
import {
  classifySttWalletTransition,
  extractTouchedWalletUnits,
  getSttPolicyId,
  getSttScriptAddress
} from "@/lib/stt-cache/domain";

test("extractTouchedWalletUnits classifies mint, forward, and close STT transitions", () => {
  const fixture = createSttFixture();
  const mintTouchpoint = extractTouchedWalletUnits(
    fixture.mintTransaction,
    getSttPolicyId(),
    getSttScriptAddress()
  ).get(fixture.unit);
  const forwardTouchpoint = extractTouchedWalletUnits(
    buildForwardTransaction(),
    getSttPolicyId(),
    getSttScriptAddress()
  ).get(fixture.unit);
  const closeTouchpoint = extractTouchedWalletUnits(
    buildCloseTransaction(),
    getSttPolicyId(),
    getSttScriptAddress()
  ).get(fixture.unit);

  assert.deepEqual(mintTouchpoint, {
    hasInput: false,
    hasOutput: true
  });
  assert.equal(
    classifySttWalletTransition(mintTouchpoint ?? { hasInput: false, hasOutput: false }),
    "MINT"
  );
  assert.deepEqual(forwardTouchpoint, {
    hasInput: true,
    hasOutput: true
  });
  assert.equal(
    classifySttWalletTransition(forwardTouchpoint ?? { hasInput: false, hasOutput: false }),
    "FORWARD"
  );
  assert.deepEqual(closeTouchpoint, {
    hasInput: true,
    hasOutput: false
  });
  assert.equal(
    classifySttWalletTransition(closeTouchpoint ?? { hasInput: false, hasOutput: false }),
    "CLOSE"
  );
});
