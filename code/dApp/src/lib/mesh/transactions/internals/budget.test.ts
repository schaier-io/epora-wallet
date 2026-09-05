import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSerializedTransactionIsBounded,
  assertSerializedTransactionSizeIsBounded,
  assertSerializedTransactionShapeIsBounded,
  assertTransactionShapeIsBounded,
  readTransactionShape
} from "@/lib/mesh/transactions/internals/budget";
import {
  MAX_GOVERNANCE_TRANSACTION_REDEEMERS,
  MAX_TRANSACTION_INPUTS,
  MAX_TRANSACTION_OUTPUTS,
  MAX_TRANSACTION_REDEEMERS,
  MAX_TRANSACTION_SIGNATORIES
} from "@/lib/contracts/transaction-limits";
import { CARDANO_MAX_TX_SIZE_BYTES } from "@/lib/mesh/transactions/internals/constants";

const AT_LIMIT = {
  inputs: MAX_TRANSACTION_INPUTS,
  outputs: MAX_TRANSACTION_OUTPUTS,
  signatories: MAX_TRANSACTION_SIGNATORIES,
  redeemers: MAX_TRANSACTION_REDEEMERS,
  hasGovernancePurpose: false
};
const AT_LIMIT_TRANSACTION_CBOR =
  "84a50084825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa03018482581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b4082581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b4082581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b4082581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a800e8a581c00000000000000000000000000000000000000000000000000000000581c00000000000000000000000000000000000000000000000000000001581c00000000000000000000000000000000000000000000000000000002581c00000000000000000000000000000000000000000000000000000003581c00000000000000000000000000000000000000000000000000000004581c00000000000000000000000000000000000000000000000000000005581c00000000000000000000000000000000000000000000000000000006581c00000000000000000000000000000000000000000000000000000007581c00000000000000000000000000000000000000000000000000000008581c00000000000000000000000000000000000000000000000000000009a10583840000d8799fd8799fd87a80d87980ffff820101840100d8799fd8799fd87a80d87980ffff820101840200d8799fd8799fd87a80d87980ffff820101f5f6";
const GOVERNANCE_WITHDRAWAL_CBOR =
  "84a500d9010281825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a8005a1581df0e9dcbf89a50c1d86f196cdb4f483d25fc0aaec071d29954516d0cf981a0012d687a105a282000082d8799fd8799fd87a80d87980ffff82010182030082d87a80820101f5f6";

test("reads and accepts final CBOR at every standard on-chain shape limit", () => {
  assert.deepEqual(readTransactionShape(AT_LIMIT_TRANSACTION_CBOR), AT_LIMIT);
  assert.doesNotThrow(() =>
    assertSerializedTransactionShapeIsBounded(AT_LIMIT_TRANSACTION_CBOR)
  );
  assert.doesNotThrow(() =>
    assertSerializedTransactionIsBounded(AT_LIMIT_TRANSACTION_CBOR)
  );
});

test("accepts a standard transaction at every on-chain shape limit", () => {
  assert.doesNotThrow(() => assertTransactionShapeIsBounded(AT_LIMIT));
});

test("rejects each standard transaction collection above its on-chain limit", () => {
  for (const field of ["inputs", "outputs", "signatories", "redeemers"] as const) {
    assert.throws(
      () =>
        assertTransactionShapeIsBounded({
          ...AT_LIMIT,
          [field]: AT_LIMIT[field] + 1
        }),
      new RegExp(`${field}.*on-chain limit`, "i")
    );
  }
});

test("uses the tighter redeemer limit for governance purposes", () => {
  assert.equal(readTransactionShape(GOVERNANCE_WITHDRAWAL_CBOR).hasGovernancePurpose, true);
  assert.doesNotThrow(() =>
    assertSerializedTransactionShapeIsBounded(GOVERNANCE_WITHDRAWAL_CBOR)
  );
  assert.doesNotThrow(() =>
    assertTransactionShapeIsBounded({
      ...AT_LIMIT,
      redeemers: MAX_GOVERNANCE_TRANSACTION_REDEEMERS,
      hasGovernancePurpose: true
    })
  );
  assert.throws(
    () =>
      assertTransactionShapeIsBounded({
        ...AT_LIMIT,
        redeemers: MAX_GOVERNANCE_TRANSACTION_REDEEMERS + 1,
        hasGovernancePurpose: true
      }),
    new RegExp(
      `redeemers.*on-chain limit is ${MAX_GOVERNANCE_TRANSACTION_REDEEMERS}`,
      "i"
    )
  );
});

test("enforces the serialized transaction byte limit", () => {
  assert.doesNotThrow(() =>
    assertSerializedTransactionSizeIsBounded(
      "ab".repeat(CARDANO_MAX_TX_SIZE_BYTES)
    )
  );
  assert.throws(
    () =>
      assertSerializedTransactionSizeIsBounded(
        "ab".repeat(CARDANO_MAX_TX_SIZE_BYTES + 1)
      ),
    /Serialized transaction uses 16385 bytes.*limit is 16384/
  );
});
