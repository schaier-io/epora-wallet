import assert from "node:assert/strict";
import { test } from "node:test";
import { MeshTxBuilder, SLOT_CONFIG_NETWORK, slotToBeginUnixTime, type UTxO } from "@meshsdk/core";
import { NETWORK } from "@/lib/mesh/transactions/internals/constants";
import { bech32Encode } from "@/lib/bech32";
import { buildWalletActivityEvents } from "./activity";
import { decodePendingTransaction } from "./pending-transaction";

// Header 0x70: an enterprise script address on testnet, the shape of a smart wallet.
const WALLET = bech32Encode("addr_test", Uint8Array.of(0x70, ...new Uint8Array(28).fill(0x22)));
const PAYEE = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const TX_HASH = "ef".repeat(32);
const TTL_SLOT = 90_000_000;
const DATUM_CBOR = "d87980";

const walletFunds: UTxO = {
  input: { txHash: "aa".repeat(32), outputIndex: 1 },
  output: { address: WALLET, amount: [{ unit: "lovelace", quantity: "10000000" }] }
};

function sendTwoAda() {
  return new MeshTxBuilder()
    .txIn(walletFunds.input.txHash, walletFunds.input.outputIndex, walletFunds.output.amount, WALLET)
    .txIn("bb".repeat(32), 0, [{ unit: "lovelace", quantity: "3000000" }], PAYEE)
    .txOut(PAYEE, [{ unit: "lovelace", quantity: "2000000" }])
    .txOut(WALLET, [{ unit: "lovelace", quantity: "8000000" }])
    .txOutInlineDatumValue(DATUM_CBOR, "CBOR")
    .invalidHereafter(TTL_SLOT)
    .completeSync();
}

test("a submitted body decodes into the row the indexer will later return", () => {
  const decoded = decodePendingTransaction(TX_HASH, sendTwoAda(), [walletFunds]);
  assert.ok(decoded);
  const { transaction, validUntilMs } = decoded;
  assert.equal(transaction.hash, TX_HASH);
  assert.deepEqual(transaction.outputs.map((utxo) => [utxo.input.outputIndex, utxo.output.address, utxo.output.amount]), [
    [0, PAYEE, [{ unit: "lovelace", quantity: "2000000" }]],
    [1, WALLET, [{ unit: "lovelace", quantity: "8000000" }]]
  ]);
  assert.equal(transaction.outputs[1]!.output.plutusData, DATUM_CBOR);
  assert.equal(validUntilMs, slotToBeginUnixTime(TTL_SLOT, SLOT_CONFIG_NETWORK[NETWORK]));
  assert.equal(transaction.blockTime, undefined);
});

// The unknown input (the signer's, absent from the known set) is left out rather than
// guessed. The wallet's own input is known, so the balance change is still exact.
test("only known inputs are resolved, and the wallet change stays exact", () => {
  const decoded = decodePendingTransaction(TX_HASH, sendTwoAda(), [walletFunds]);
  assert.deepEqual(decoded!.transaction.inputs, [walletFunds]);
  const [event] = buildWalletActivityEvents(decoded!.transaction, WALLET);
  assert.equal(event!.title, "Funds sent");
  assert.match(event!.amountSummary, /-2/);
});

test("a body that cannot be decoded yields no pending row", () => {
  assert.equal(decodePendingTransaction(TX_HASH, "not-cbor", []), null);
});

test("native assets keep the policy-plus-name unit the rest of the feed uses", () => {
  const unit = `${"cd".repeat(28)}4e4654`;
  const txHex = new MeshTxBuilder()
    .txIn(walletFunds.input.txHash, walletFunds.input.outputIndex, walletFunds.output.amount, WALLET)
    .txOut(PAYEE, [{ unit: "lovelace", quantity: "2000000" }, { unit, quantity: "5" }])
    .completeSync();
  const decoded = decodePendingTransaction(TX_HASH, txHex, [walletFunds]);
  assert.deepEqual(decoded!.transaction.outputs[0]!.output.amount, [
    { unit: "lovelace", quantity: "2000000" },
    { unit, quantity: "5" }
  ]);
  assert.equal(decoded!.validUntilMs, null);
});
