import {
  resolvePlutusScriptAddress,
  BlockfrostProvider,
  MeshWallet,
  Transaction,
  applyParamsToScript,
} from "@meshsdk/core";
import fs from "node:fs";
import "dotenv/config";

// Example: deposit ("lock") funds into an existing permission-based wallet by
// sending them to the WALLET spend script address. The wallet validator
// (`wallet.wallet.spend`) is parameterized per STT by `[stt_policy_id,
// asset_name]`, so the address you fund is specific to one minted wallet. Funds
// sit at this address as plain (no-datum) UTxOs and are later moved only through
// a co-firing STT spend (operator Use / allowance / beneficiary / streaming
// crank). This mirrors the frontend `buildLockFundsTx` flow.
//
// NOTE: this funds the wallet — it does NOT mint the STT or create the State.
// Run `mint_state_token.mjs` first; it prints the STT policy id and asset name,
// which you must paste below so the derived address matches your wallet.

console.log("Locking funds into the wallet spend address (example)");

const network = "preprod";
const blockfrostApiKey = process.env.BLOCKFROST_API_KEY;
if (!blockfrostApiKey) {
  throw new Error("Missing BLOCKFROST_API_KEY in environment (see .env.example).");
}
const blockchainProvider = new BlockfrostProvider(blockfrostApiKey);
const wallet = new MeshWallet({
  networkId: 0,
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
  key: {
    type: "mnemonic",
    words: fs.readFileSync("wallet_1.sk").toString().split(" "),
  },
});

// The STT policy id and asset name of the wallet you are funding. Both are
// printed by `mint_state_token.mjs` ("Policy ID:" and the asset name it derives
// from the seed UTxO). They MUST match your minted STT — the wallet address is
// derived from them, so wrong values send funds to a different (possibly
// nonexistent) wallet.
const sttPolicyId =
  process.env.STT_POLICY_ID ??
  "ab590bf0dfe4113dc719a4ed90c167b076af7885d70ca625624ceb8f";
const sttAssetName =
  process.env.STT_ASSET_NAME ??
  "86c3dbef1619a7fe0eae5fdcfa9bb11c8f9232a7d00e8f865e4d29a32ca37872";

const blueprint = JSON.parse(fs.readFileSync("./plutus.json"));
// Resolve the wallet spend validator BY TITLE rather than a fixed index: the
// validator order in plutus.json changes when validators are added/removed
// (e.g. `stt_reference_store` shifted every later index), and a hard-coded index
// previously pointed this script at the always-fail reference-store validator,
// permanently stranding the funds.
const walletValidator = blueprint.validators.find(
  (v) => v.title === "wallet.wallet.spend"
);
if (!walletValidator) {
  throw new Error("wallet.wallet.spend not found in plutus.json — run `aiken build`.");
}

const script = {
  code: applyParamsToScript(walletValidator.compiledCode, [
    sttPolicyId,
    sttAssetName,
  ]),
  version: "V3",
};
// Enterprise wallet address (stake credential None), matching the default
// off-chain build and `resolveWalletSpendAddress` in the frontend blueprint.
const walletAddress = resolvePlutusScriptAddress(script, 0);

const utxos = await wallet.getUtxos();
if (utxos.length === 0) {
  throw new Error("No UTXOs found in the wallet. Wallet is empty.");
}

// Plain deposit: no datum. The wallet validator ignores the spend datum
// (`_datum: Option<Data>`), so continuing wallet UTxOs carry none.
const unsignedTx = await new Transaction({
  initiator: wallet,
  fetcher: blockchainProvider,
})
  .sendLovelace(walletAddress, "100000000")
  .build();

const signedTx = await wallet.signTx(unsignedTx);
const txHash = await wallet.submitTx(signedTx);

console.log(`Created locking transaction:
    Tx ID: ${txHash}
    View (after a bit) on https://${
      process.env.BLOCKFROST_API_KEY?.toLowerCase().startsWith("preview")
        ? "preview."
        : process.env.BLOCKFROST_API_KEY?.toLowerCase().startsWith("preprod")
        ? "preprod."
        : ""
    }cardanoscan.io/transaction/${txHash}
    Wallet address funded: ${walletAddress}
`);
