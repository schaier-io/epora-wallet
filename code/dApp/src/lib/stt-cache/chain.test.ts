import assert from "node:assert/strict";
import test from "node:test";
import { createSttChainClient, normalizeTransactionInfoUtxos } from "./chain";
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

// --- createSttChainClient ----------------------------------------------------
//
// Mesh's own fetchAddressUTxOs and fetchCollectionAssets swallow every failure
// into an empty list, and the indexer reads an empty list as "wallet closed".
// The client reads Blockfrost directly so a 429 or 5xx reaches the caller.

function meshHttpError(status: number) {
  return JSON.stringify({ data: { status_code: status }, headers: {}, status });
}

function flatUtxo(index: number) {
  return {
    address: SCRIPT_ADDRESS,
    amount: [{ unit: UNIT, quantity: "1" }],
    tx_hash: TX_HASH,
    output_index: index,
    inline_datum: "d87980"
  };
}

function clientWith(get: (url: string) => Promise<unknown>) {
  return createSttChainClient({
    get,
    fetchTxInfo: async () => {
      throw new Error("not used");
    }
  });
}

test("fetchAddressUTxOs surfaces an upstream failure instead of answering with no UTxOs", async () => {
  const client = clientWith(async () => {
    throw meshHttpError(429);
  });
  await assert.rejects(client.fetchAddressUTxOs(SCRIPT_ADDRESS, UNIT), /"status":429/);
});

test("fetchAddressUTxOs treats a 404 as an address Blockfrost has never seen", async () => {
  const client = clientWith(async () => {
    throw meshHttpError(404);
  });
  assert.deepEqual(await client.fetchAddressUTxOs(SCRIPT_ADDRESS, UNIT), []);
});

test("rejects a 200 whose body is not a list instead of reading it as nothing", async () => {
  // A proxy answering an error object with 200 must not close the wallet.
  const client = clientWith(async () => ({ error: "Bad Gateway", status_code: 502 }));
  await assert.rejects(client.fetchAddressUTxOs(SCRIPT_ADDRESS, UNIT));
  await assert.rejects(client.fetchCollectionAssets(POLICY));
});

test("fetchAddressUTxOs walks every full page and maps the flat wire shape", async () => {
  const urls: string[] = [];
  const client = clientWith(async (url) => {
    urls.push(url);
    return url.endsWith("page=1")
      ? Array.from({ length: 100 }, (_, index) => flatUtxo(index))
      : [flatUtxo(100)];
  });
  const utxos = await client.fetchAddressUTxOs(SCRIPT_ADDRESS, UNIT);
  assert.equal(utxos.length, 101);
  assert.deepEqual(urls, [
    `/addresses/${SCRIPT_ADDRESS}/utxos/${UNIT}?page=1`,
    `/addresses/${SCRIPT_ADDRESS}/utxos/${UNIT}?page=2`
  ]);
  assert.deepEqual(utxos[100], {
    input: { txHash: TX_HASH, outputIndex: 100 },
    output: {
      address: SCRIPT_ADDRESS,
      amount: [{ unit: UNIT, quantity: "1" }],
      plutusData: "d87980"
    }
  });
});

test("fetchAddressUTxOs rejects a page whose entry carries no tx_hash", async () => {
  // The indexer persists input.txHash as the wallet's currentTxHash, so an entry
  // without one must fail the page outright instead of converting into an
  // empty-hash UTxO through toMeshUtxo's fallback.
  const client = clientWith(async () => [
    { address: SCRIPT_ADDRESS, amount: [{ unit: UNIT, quantity: "1" }], output_index: 0 }
  ]);
  await assert.rejects(client.fetchAddressUTxOs(SCRIPT_ADDRESS, UNIT));
});

test("fetchCollectionAssets surfaces an upstream failure and pages by 100", async () => {
  const failing = clientWith(async () => {
    throw meshHttpError(500);
  });
  await assert.rejects(failing.fetchCollectionAssets(POLICY), /"status":500/);

  const client = clientWith(async (url) =>
    url.endsWith("page=1")
      ? Array.from({ length: 100 }, (_, index) => ({ asset: `${POLICY}${index}`, quantity: "1" }))
      : [{ asset: UNIT, quantity: "1" }]
  );
  const first = await client.fetchCollectionAssets(POLICY);
  assert.equal(first.assets.length, 100);
  assert.equal(first.next, 2);
  const second = await client.fetchCollectionAssets(POLICY, first.next ?? undefined);
  assert.deepEqual(second, { assets: [{ unit: UNIT, quantity: "1" }], next: null });
});
