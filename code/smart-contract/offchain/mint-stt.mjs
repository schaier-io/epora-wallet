// Mint a fresh STT (state thread token) with an initial State datum, creating a
// new permission-based wallet. Prints the STT policy id and derived asset name
// that the other scripts (fund-wallet-example, forward-stt, ...) need.
// Prereqs: generate-credentials.mjs, a funded wallet_1, provider key in .env.
// RUN ORDER: 2nd — creates the wallet every later script operates on.
import cbor from "cbor";
import {
  MeshWallet,
  Transaction,
  unixTimeToEnclosingSlot,
  resolvePaymentKeyHash,
  SLOT_CONFIG_NETWORK,
} from "@meshsdk/core";
import fs from "node:fs";
import "dotenv/config";
import {
  loadBlueprint,
  plutusScript,
  policyIdOf,
  scriptAddress as resolveScriptAddress,
  sttAssetName,
} from "./lib/blueprint.mjs";
import { resolveProvider } from "./lib/network.mjs";

console.log("Minting example asset");
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

const wallet1 = new MeshWallet({
  networkId: 0,
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
  key: {
    type: "mnemonic",
    words: fs.readFileSync("wallet_2.sk").toString().split(" "),
  },
});

const blueprint = loadBlueprint("./plutus.json");
const script = plutusScript(blueprint, "stt.stt.mint");

const address = (await wallet.getUnusedAddresses())[0];
console.log("address", address);
const address_beneficiary = (await wallet1.getUnusedAddresses())[0];
console.log("address_beneficiary", address_beneficiary);
const script_address = resolveScriptAddress(script, 0);
console.log("script_address", script_address);
const utxos = await wallet.getUtxos();
if (utxos.length === 0) {
  throw new Error("No UTXOs found for the specified wallet");
}

console.log(`Found ${utxos.length} UTXOs for wallet`);

const firstUtxo = utxos[0];
console.log(
  `Using UTXO: ${firstUtxo.input.txHash}#${firstUtxo.input.outputIndex}`
);

// Derived exactly as the validator derives it — see
// `lib/stt/io.output_reference_to_asset_name` and the cross-boundary test
// `offchain/test/blueprint.test.mjs`.
const assetName = sttAssetName(
  firstUtxo.input.txHash,
  firstUtxo.input.outputIndex,
);

const redeemer = {
  data: { alternative: 0, fields: [] },
  tag: "MINT",
};
const policyId = policyIdOf(script);

console.log("Policy ID:", policyId);

const noneData = { alternative: 1, fields: [] };
const falseData = { alternative: 0, fields: [] };
const trueData = { alternative: 1, fields: [] };

const adminUser = {
  alternative: 0,
  fields: [
    0,
    [resolvePaymentKeyHash(address)],
    [],
    [],
    0,
    falseData,
    noneData,
    trueData,
  ],
};

const beneficiary = {
  alternative: 0,
  fields: [
    0,
    [resolvePaymentKeyHash(address_beneficiary)],
    noneData,
    1,
  ],
};

// The STT datum is the State constructor directly — no wrapper datum type.
//
// State layout (see `lib/state/types.ak`):
//   State { access: AccessControl, proof_of_life: ProofOfLifeSettings,
//           streaming_payments: List<StreamingPayment>, wallet_name: ByteArray,
//           intended_stake_credential: Option<Credential>,
//           last_non_admin_payout_at: Option<POSIXTime> }
//   AccessControl { users, multi_sig_threshold: Option<Int>, beneficiaries }
//   ProofOfLifeSettings { unlock_time: Option<POSIXTime>, increment: Option<Int> }
//
// `intended_stake_credential: None` = enterprise wallet address (no
// delegation), matching `blueprint.scriptAddress(script, 0)` below.
// `last_non_admin_payout_at` MUST be None at mint — `eval_mint` rejects a
// seeded cooldown stamp (whitepaper: Settlement-cadence theorem).
const accessControl = {
  alternative: 0,
  fields: [[adminUser], noneData, [beneficiary]],
};
const proofOfLife = {
  alternative: 0,
  fields: [noneData, noneData],
};
const datum = {
  value: {
    alternative: 0,
    fields: [
      accessControl,
      proofOfLife,
      [],
      Buffer.from("Smart wallet", "utf8").toString("hex"),
      noneData,
      noneData,
    ],
  },
  inline: true,
};

const tx = new Transaction({ initiator: wallet, fetcher: blockchainProvider });
// Set validity interval
const invalidBefore =
  unixTimeToEnclosingSlot(Date.now() - 150000, SLOT_CONFIG_NETWORK.preprod) - 1;
const invalidHereafter =
  unixTimeToEnclosingSlot(Date.now() + 150000, SLOT_CONFIG_NETWORK.preprod) + 1;

tx.txBuilder.invalidBefore(invalidBefore);
tx.txBuilder.invalidHereafter(invalidHereafter);
// Set inputs - only use the first UTxO to avoid issues
tx.setTxInputs([firstUtxo]);

tx.isCollateralNeeded = true;

//setup minting data separately as the minting function does not work well with hex encoded strings without some magic
tx.txBuilder
  .mintPlutusScript(script.version)
  .mint("1", policyId, assetName)
  .mintingScript(script.code)
  .mintRedeemerValue(redeemer.data, "Mesh");

//setup the metadata
tx.setMetadata(721, {
  [policyId]: {
    [assetName]: {
      name: "Epora wallet STT",
      description: "Epora permission-wallet state thread token (STT)",
      image: "ipfs://test123",
    },
  },
});

// Send the minted asset to the script address with the datum
tx.sendAssets(
  {
    address: script_address,
    datum: {
      value: datum.value,
      inline: true,
    },
  },
  [
    { unit: policyId + assetName, quantity: "1" },
    { unit: "lovelace", quantity: "2000000" },
  ]
);

// Send some lovelace back to your wallet
tx.sendLovelace(address, "5000000");

//sign the transaction with our address
tx.setRequiredSigners([address]).setChangeAddress(address).setNetwork(network);

try {
  console.log("Building transaction...");
  //build the transaction
  const unsignedTx = await tx.build();
  console.log("Transaction built successfully");

  console.log("Signing transaction...");
  const signedTx = await wallet.signTx(unsignedTx, true);
  console.log("Transaction signed successfully");

  console.log("Submitting transaction...");
  //submit the transaction to the blockchain, it can take a bit until the transaction is confirmed and found on the explorer
  const txHash = await wallet.submitTx(signedTx);
  console.log("Transaction submitted successfully");

  console.log(`Minted 1 asset with the contract at:
      Tx ID: ${txHash}
      View (after a bit) on https://${
        network === "preprod" ? "preprod." : ""
      }cardanoscan.io/transaction/${txHash}
      AssetName: ${assetName}
      PolicyId: ${policyId}
      AssetId: ${policyId + assetName}
      Script Address: ${script_address}
  `);
} catch (error) {
  console.error("Error:", error);
  if (error.response && error.response.data) {
    console.error(
      "Response data:",
      JSON.stringify(error.response.data, null, 2)
    );
  }
}
