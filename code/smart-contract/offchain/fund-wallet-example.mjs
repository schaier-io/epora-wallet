import { MeshWallet, Transaction } from "@meshsdk/core";
import fs from "node:fs";
import "dotenv/config";
import {
  loadBlueprint,
  plutusScript,
  scriptAddress as resolveScriptAddress,
} from "./lib/blueprint.mjs";
import { resolveProvider } from "./lib/network.mjs";

// Example: deposit ("lock") funds into an existing permission-based wallet by
// sending them to the WALLET spend script address. The wallet validator
// (`wallet.wallet.spend`) is parameterized per STT by `[stt_policy_id,
// asset_name]`, so the address you fund is specific to one minted wallet. Funds
// sit at this address as plain (no-datum) UTxOs and are later moved only through
// a co-firing STT spend (operator Use / allowance / beneficiary / streaming
// crank). This mirrors the frontend `buildLockFundsTx` flow.
//
// NOTE: this funds the wallet — it does NOT mint the STT or create the State.
// Run `mint-stt.mjs` first; it prints the STT policy id and asset name,
// which you must paste below so the derived address matches your wallet.

console.log("Locking funds into the wallet spend address (example)");

const { provider: blockchainProvider, network } = resolveProvider();
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
// printed by `mint-stt.mjs` ("Policy ID:" and the asset name it derives
// from the seed UTxO). They MUST match your minted STT — the wallet address is
// derived from them, so wrong values send funds to a different (possibly
// nonexistent) wallet.
const sttPolicyId =
  process.env.STT_POLICY_ID ??
  "ab590bf0dfe4113dc719a4ed90c167b076af7885d70ca625624ceb8f";
const sttAssetName =
  process.env.STT_ASSET_NAME ??
  "86c3dbef1619a7fe0eae5fdcfa9bb11c8f9232a7d00e8f865e4d29a32ca37872";

// The wallet validator is parameterized per STT by [policy_id, asset_name], so
// the address below is specific to one minted wallet.
const blueprint = loadBlueprint("./plutus.json");
const script = plutusScript(blueprint, "wallet.wallet.spend", [
  sttPolicyId,
  sttAssetName,
]);
// Enterprise wallet address (stake credential None), matching the default
// off-chain build and `resolveWalletSpendAddress` in the frontend blueprint.
const walletAddress = resolveScriptAddress(script, 0);

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
