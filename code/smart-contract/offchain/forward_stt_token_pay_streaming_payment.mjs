import cbor from "cbor";
import {
  resolvePlutusScriptAddress,
  resolvePaymentKeyHash,
  BlockfrostProvider,
  SLOT_CONFIG_NETWORK,
  MeshWallet,
  Transaction,
  unixTimeToEnclosingSlot,
  slotToBeginUnixTime,
  applyParamsToScript,
} from "@meshsdk/core";
import { deserializePlutusScript } from "@meshsdk/core-cst";
import fs from "node:fs";
import "dotenv/config";

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

const wallet1 = new MeshWallet({
  networkId: 0,
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
  key: {
    type: "mnemonic",
    words: fs.readFileSync("wallet_2.sk").toString().split(" "),
  },
});

const blueprint = JSON.parse(fs.readFileSync("./plutus.json"));

// Resolve the STT validator BY TITLE rather than a fixed index: the validator
// order in plutus.json changes when validators are added/removed, and a
// hard-coded index previously pointed scripts at the always-fail
// reference-store validator (see lock-example.mjs).
const sttValidator = blueprint.validators.find(
  (v) => v.title === "stt.stt.spend"
);
if (!sttValidator) {
  throw new Error("stt.stt.spend not found in plutus.json — run `aiken build`.");
}

const script = {
  code: applyParamsToScript(sttValidator.compiledCode, []),
  version: "V3",
};

const address = (await wallet.getUnusedAddresses())[0];
console.log("address", address);
const address_beneficiary = (await wallet1.getUnusedAddresses())[0];
console.log("address_beneficiary", address_beneficiary);
const script_address = resolvePlutusScriptAddress(script, 0);
console.log("script_address", script_address);

const scriptAddress = resolvePlutusScriptAddress(script, 0);
console.log("Script address:", scriptAddress);

// Get wallet UTxOs for fees and change
const walletUtxos = await wallet.getUtxos();
if (walletUtxos.length === 0) {
  throw new Error("No UTXOs found in the wallet. Wallet is empty.");
}
console.log(`Found ${walletUtxos.length} UTXOs in wallet`);

// Fetch the specific UTxO from the script address
async function fetchUtxo(txHash) {
  console.log(`Fetching UTxO with txHash: ${txHash}`);
  const utxos = await blockchainProvider.fetchAddressUTxOs(scriptAddress);
  console.log(`Found ${utxos.length} UTxOs at script address`);

  const utxo = utxos.find((utxo) => utxo.input.txHash === txHash);

  if (!utxo) {
    throw new Error(`UTxO with txHash ${txHash} not found at address`);
  }

  console.log("Found UTxO:", utxo.input.txHash, "#", utxo.input.outputIndex);
  console.log("UTxO amount:", utxo.output.amount);

  return utxo;
}

// Use the specific UTxO you mentioned
const utxo = await fetchUtxo(
  "733c97dbb6f89485ad8be00abe770f5a8fe855e3d9792c21cdb585272abdc38d"
);

// Verify the UTxO has a datum
const utxoDatum = utxo.output.plutusData;
if (!utxoDatum) {
  throw new Error("No datum found in UTxO");
}
console.log("UTxO datum:", utxoDatum);

// Get the policy ID
const policyId = deserializePlutusScript(script.code, script.version)
  .hash()
  .toString();
console.log("Policy ID:", policyId);

const decodedDatum = cbor.decode(Buffer.from(utxoDatum, "hex"));
const others = decodedDatum.value[0];
if (!others) {
  throw new Error("Invalid datum at position 0");
}
console.log("beneficiary vkey", resolvePaymentKeyHash(address_beneficiary));

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

// The crank's validity window feeds the datum below: the validator caps
// `tx_latest - tx_earliest` at 1 h (`max_payout_validity_window_ms`) and
// requires the output state to stamp `last_permissionless_payout_at` with the
// tx UPPER bound (ADR-0009), so compute the window before the datum.
const invalidBefore =
  unixTimeToEnclosingSlot(Date.now() - 150000, SLOT_CONFIG_NETWORK.preprod) - 1;
const invalidHereafter =
  unixTimeToEnclosingSlot(Date.now() + 150000, SLOT_CONFIG_NETWORK.preprod) + 1;
// POSIX ms the ledger derives from the `invalid_hereafter` slot — the exact
// value `eval_pay_streaming_payment` expects in the stamp.
const txUpperBoundMs = slotToBeginUnixTime(
  invalidHereafter,
  SLOT_CONFIG_NETWORK.preprod
);

// State layout (see `lib/state/types.ak`): nested AccessControl +
// ProofOfLifeSettings groups, then streaming_payments, wallet_name,
// intended_stake_credential and last_permissionless_payout_at.
//
// A `PayStreamingPayment` crank may ONLY rewrite `streaming_payments` (here:
// the matured stream is removed, settling its remainder to the tagged output
// below) and MUST stamp `last_permissionless_payout_at = Some(tx upper bound)`.
// Everything else — access, proof_of_life, wallet_name,
// intended_stake_credential — must be forwarded unchanged from the input
// datum; the values below assume the `mint_state_token.mjs` defaults.
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
      { alternative: 0, fields: [txUpperBoundMs] },
    ],
  },
  inline: true,
};

console.log("New datum:", JSON.stringify(datum, null, 2));

// Create the redeemer — SttAction::PayStreamingPayment(payout_delta).
// payout_delta is AssetEntries (List<(policy_id, asset_name, quantity)>) and
// must equal the value moved into the tagged streaming-payment output below
// (2.1 ADA to the beneficiary).
const redeemer = {
  data: {
    alternative: 4,
    fields: [[["", "", 2100000]]],
  },
};

const tx = new Transaction({
  initiator: wallet,
  fetcher: blockchainProvider,
});

// Set collateral explicitly
tx.isCollateralNeeded = true;
// Add wallet UTxOs for fees and collateral - NOT the script UTxO
tx.setTxInputs(walletUtxos);
// Redeem the token from the script
tx.redeemValue({
  value: utxo,
  script: script,
  redeemer: redeemer,
});
// Send the token back to the script with new datum
tx.sendValue(
  {
    address: scriptAddress,
    datum: {
      value: datum.value,
      inline: true,
    },
  },
  utxo
);

// Send some ADA back to wallet
tx.sendLovelace(address, "10000000");
// Create OutputId datum for the beneficiary payout
const outputIdDatum = {
  value: {
    alternative: 0,
    fields: [
      // id: streaming-payment id (using a placeholder for now)
      1234,
      // transaction_id: the UTxO transaction hash being consumed
      utxo.input.txHash,
      // output_index: the UTxO output index being consumed
      utxo.input.outputIndex,
    ],
  },
  inline: true,
};

tx.sendAssets(
  {
    address: address_beneficiary,
    datum: outputIdDatum,
  },
  [{ unit: "lovelace", quantity: "2100000" }]
);

// Set transaction parameters
tx.setChangeAddress(address).setRequiredSigners([address]);

tx.txBuilder.invalidBefore(invalidBefore);
tx.txBuilder.invalidHereafter(invalidHereafter);

try {
  console.log("Building transaction...");
  const buildTransaction = await tx.build();
  console.log("Transaction built successfully");

  console.log("Signing transaction...");
  const signedTx = await wallet.signTx(buildTransaction, true);
  console.log("Transaction signed successfully");

  console.log("Submitting transaction...");
  const txHash = await wallet.submitTx(signedTx);
  console.log("Transaction submitted successfully");

  console.log(`Created forward transaction:
    Tx ID: ${txHash}
    View (after a bit) on https://preprod.cardanoscan.io/transaction/${txHash}
    Script Address: ${scriptAddress}
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
