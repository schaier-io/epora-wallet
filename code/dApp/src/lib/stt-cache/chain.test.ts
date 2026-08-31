import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTransactionInfoUtxos } from "./chain";
import { extractTouchedWalletUnits } from "./domain";
import type { TransactionInfo } from "@meshsdk/common";

const POLICY = "aa".repeat(28);
const UNIT = `${POLICY}53545430`;
const SCRIPT_ADDRESS = "addr_test1wqstt";
const TX_HASH = "604c8364b0c45acb";

/**
 * The shape Blockfrost actually returns from `GET /txs/{hash}/utxos`, captured from preprod.
 * Flat, with no nested `output`, which is what `TransactionInfo` claims to carry.
 */
function blockfrostShaped(): TransactionInfo {
  return {
    hash: TX_HASH,
    inputs: [
      {
        address: SCRIPT_ADDRESS,
        amount: [{ unit: UNIT, quantity: "1" }],
        tx_hash: "1111",
        output_index: 0,
        collateral: false,
        reference: false,
        data_hash: null,
        inline_datum: "d87980",
        reference_script_hash: null
      },
      {
        address: SCRIPT_ADDRESS,
        amount: [{ unit: UNIT, quantity: "1" }],
        tx_hash: "2222",
        output_index: 1,
        collateral: false,
        reference: true
      },
      {
        address: SCRIPT_ADDRESS,
        amount: [{ unit: UNIT, quantity: "1" }],
        tx_hash: "3333",
        output_index: 2,
        collateral: true,
        reference: false
      }
    ],
    outputs: [
      {
        address: SCRIPT_ADDRESS,
        amount: [{ unit: UNIT, quantity: "1" }],
        output_index: 0,
        collateral: false,
        data_hash: null,
        inline_datum: "d87981",
        reference_script_hash: null
      }
    ]
  } as unknown as TransactionInfo;
}

test("normalizes Blockfrost's flat UTxOs into the nested shape TransactionInfo declares", () => {
  const normalized = normalizeTransactionInfoUtxos(blockfrostShaped());

  assert.deepEqual(normalized.inputs[0], {
    input: { txHash: "1111", outputIndex: 0 },
    output: {
      address: SCRIPT_ADDRESS,
      amount: [{ unit: UNIT, quantity: "1" }],
      plutusData: "d87980"
    }
  });
});

test("gives an output the transaction's own hash, because outputs carry none", () => {
  const normalized = normalizeTransactionInfoUtxos(blockfrostShaped());

  assert.equal(normalized.outputs.length, 1);
  assert.deepEqual(normalized.outputs[0].input, { txHash: TX_HASH, outputIndex: 0 });
});

test("drops reference and collateral inputs, which this transaction never spent", () => {
  const normalized = normalizeTransactionInfoUtxos(blockfrostShaped());

  assert.deepEqual(
    normalized.inputs.map((utxo) => utxo.input.txHash),
    ["1111"]
  );
});

test("passes an already nested UTxO through untouched", () => {
  const nested = {
    input: { txHash: "4444", outputIndex: 3 },
    output: { address: SCRIPT_ADDRESS, amount: [{ unit: "lovelace", quantity: "5" }] }
  };
  const normalized = normalizeTransactionInfoUtxos({
    hash: TX_HASH,
    inputs: [nested],
    outputs: []
  } as unknown as TransactionInfo);

  assert.deepEqual(normalized.inputs[0], nested);
});

/**
 * The regression this fixes: `extractTouchedWalletUnits` read `utxo.output.address` on the raw
 * Blockfrost entry, where `output` is undefined, so it threw on the first transaction of every
 * sync and the STT cache stayed empty.
 */
test("lets extractTouchedWalletUnits read a real Blockfrost transaction", () => {
  assert.throws(
    () => extractTouchedWalletUnits(blockfrostShaped(), POLICY, SCRIPT_ADDRESS),
    /Cannot read properties of undefined/
  );

  const touched = extractTouchedWalletUnits(
    normalizeTransactionInfoUtxos(blockfrostShaped()),
    POLICY,
    SCRIPT_ADDRESS
  );

  assert.deepEqual(touched.get(UNIT), { hasInput: true, hasOutput: true });
});

test("rejects an entry that is neither shape rather than silently dropping it", () => {
  assert.throws(() =>
    normalizeTransactionInfoUtxos({
      hash: TX_HASH,
      inputs: [{ amount: [{ unit: UNIT, quantity: "1" }], output_index: 0 }],
      outputs: []
    } as unknown as TransactionInfo)
  );
});
