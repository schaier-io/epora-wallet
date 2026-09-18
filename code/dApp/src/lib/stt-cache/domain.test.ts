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
  getSttScriptAddress,
  parseChainSlot,
  snapshotIsBehindStored
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

test("parseChainSlot accepts only non-negative safe-integer slot strings", () => {
  assert.equal(parseChainSlot("72888114"), 72888114);
  assert.equal(parseChainSlot("0"), 0);
  assert.equal(parseChainSlot(""), null);
  assert.equal(parseChainSlot(null), null);
  assert.equal(parseChainSlot(undefined), null);
  assert.equal(parseChainSlot("12x"), null);
  assert.equal(parseChainSlot("-1"), null);
  assert.equal(parseChainSlot("1.5"), null);
  assert.equal(parseChainSlot("0x10"), null);
  assert.equal(parseChainSlot("1e3"), null);
  assert.equal(parseChainSlot("99999999999999999999"), null);
});

test("snapshotIsBehindStored orders snapshots by slot when both carry one", () => {
  const stored = { blockHeight: null, blockTime: null, slot: 123500, txIndex: null };
  assert.equal(
    snapshotIsBehindStored(
      stored,
      { blockHeight: null, blockTime: null, slot: 123456, txIndex: null }
    ),
    true
  );
  assert.equal(
    snapshotIsBehindStored(
      stored,
      { blockHeight: null, blockTime: null, slot: 123500, txIndex: null }
    ),
    false
  );
  assert.equal(
    snapshotIsBehindStored(
      stored,
      { blockHeight: null, blockTime: null, slot: 123501, txIndex: null }
    ),
    false
  );
});

test("snapshotIsBehindStored breaks same-block ties by transaction index", () => {
  const stored = { blockHeight: null, blockTime: null, slot: 123456, txIndex: 1 };
  // Two transitions can share a block: the earlier index sits behind.
  assert.equal(
    snapshotIsBehindStored(
      stored,
      { blockHeight: null, blockTime: null, slot: 123456, txIndex: 0 }
    ),
    true
  );
  // The later index in the same block is a genuine transition.
  assert.equal(
    snapshotIsBehindStored(
      stored,
      { blockHeight: null, blockTime: null, slot: 123456, txIndex: 2 }
    ),
    false
  );
  // The same transaction re-read (equal slot and index) stays writable and
  // idempotent.
  assert.equal(
    snapshotIsBehindStored(
      stored,
      { blockHeight: null, blockTime: null, slot: 123456, txIndex: 1 }
    ),
    false
  );
  // A missing index cannot tiebreak; the pair falls through unordered.
  assert.equal(
    snapshotIsBehindStored(
      stored,
      { blockHeight: null, blockTime: null, slot: 123456, txIndex: null }
    ),
    false
  );
});

test("snapshotIsBehindStored falls back to the block position when slots cannot order", () => {
  // Equal slots without indexes cannot order; the block position decides.
  assert.equal(
    snapshotIsBehindStored(
      { blockHeight: 112, blockTime: null, slot: 123456, txIndex: null },
      { blockHeight: 111, blockTime: null, slot: 123456, txIndex: null }
    ),
    true
  );
  // No usable slot on the stored side, positioned older incoming.
  assert.equal(
    snapshotIsBehindStored(
      { blockHeight: 112, blockTime: null, slot: null, txIndex: null },
      { blockHeight: 111, blockTime: null, slot: null, txIndex: null }
    ),
    true
  );
  // Nothing comparable on either side must not block the write.
  assert.equal(
    snapshotIsBehindStored(
      { blockHeight: 112, blockTime: null, slot: null, txIndex: null },
      { blockHeight: null, blockTime: null, slot: null, txIndex: null }
    ),
    false
  );
  // A positionless stored row with a slotted incoming read cannot be ordered.
  assert.equal(
    snapshotIsBehindStored(
      { blockHeight: null, blockTime: null, slot: null, txIndex: null },
      { blockHeight: null, blockTime: null, slot: 123456, txIndex: null }
    ),
    false
  );
});
