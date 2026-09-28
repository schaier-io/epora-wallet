import assert from "node:assert/strict";
import test from "node:test";
import { serializeTransfers, serializeWalletOutputs } from "@/components/user/workspace/helpers";
import type { TransferFormState, WalletScriptOutputFormState } from "@/components/user/workspace/types";

const noDatum = { mode: "none" as const, customAlternative: "" };

function output(amount: WalletScriptOutputFormState["amount"]): WalletScriptOutputFormState {
  return { amount, inlineDatum: noDatum };
}

function transfer(amount: TransferFormState["amount"]): TransferFormState {
  return { address: "addr_test_receiver", amount, inlineDatum: noDatum };
}

/**
 * The editors seed rows at "0". A row left there reached the transaction output
 * verbatim, and the ledger rejects zero-quantity assets after signing.
 */
test("zero-quantity rows are dropped and positive rows survive", () => {
  const outputs = serializeWalletOutputs([
    output([
      { unit: "lovelace", quantity: "0" },
      { unit: "ab".repeat(28) + "f001", quantity: "5" }
    ])
  ]);

  assert.deepEqual(outputs, [
    { amount: [{ unit: "ab".repeat(28) + "f001", quantity: "5" }], inlineDatum: undefined }
  ]);
});

test("an output whose every row is zero is refused, not silently dropped", () => {
  // Validation probes run this serializer and turn a throw into a field error
  // naming the row, so a stale draft with an all-zero output is refused where
  // the user can see it instead of vanishing from the transaction.
  assert.throws(
    () =>
      serializeWalletOutputs([
        output([{ unit: "lovelace", quantity: "0" }]),
        output([{ unit: "lovelace", quantity: "2000000" }])
      ]),
    /Locked output 1 needs an amount greater than zero/
  );
});

test("transfers drop zero rows and refuse an emptied transfer", () => {
  assert.throws(
    () =>
      serializeTransfers([
        transfer([{ unit: "lovelace", quantity: "00" }]),
        transfer([{ unit: "lovelace", quantity: "1000000" }])
      ]),
    /Transfer 1 needs an amount greater than zero/
  );

  const transfers = serializeTransfers([
    transfer([
      { unit: "lovelace", quantity: "0" },
      { unit: "ab".repeat(28) + "f001", quantity: "4" }
    ])
  ]);
  assert.deepEqual(transfers, [
    {
      address: "addr_test_receiver",
      amount: [{ unit: "ab".repeat(28) + "f001", quantity: "4" }],
      inlineDatum: undefined
    }
  ]);
});

test("a malformed inline datum still throws with the original row number", () => {
  // The per-row amount filter and the row-numbered datum error both run inside
  // the same map, so the error names the row the user edited, not a shifted one.
  assert.throws(
    () =>
      serializeWalletOutputs([
        output([{ unit: "lovelace", quantity: "1000000" }]),
        { amount: [{ unit: "lovelace", quantity: "1" }], inlineDatum: { mode: "custom-empty", customAlternative: "-1" } }
      ]),
    /Locked output 2 inline datum/
  );
});
