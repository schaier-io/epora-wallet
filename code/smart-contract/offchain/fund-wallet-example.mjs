import { MeshWallet, Transaction } from "@meshsdk/core";
import fs from "node:fs";
import "dotenv/config";
import {
  loadBlueprint,
  plutusScript,
  scriptAddress as resolveScriptAddress,
} from "./lib/blueprint.mjs";
import { resolveProvider } from "./lib/network.mjs";
import { sttIdentifiersFromEnv } from "./lib/stt-env.mjs";

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
// which you must set as STT_POLICY_ID and STT_ASSET_NAME so the derived address
// matches your wallet.

const { sttPolicyId, sttAssetName } = sttIdentifiersFromEnv();

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
