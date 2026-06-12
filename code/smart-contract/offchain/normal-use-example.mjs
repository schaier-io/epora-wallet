import cbor from "cbor";
import {
  resolvePlutusScriptAddress,
  resolvePaymentKeyHash,
  BlockfrostProvider,
  SLOT_CONFIG_NETWORK,
  MeshWallet,
  Transaction,
  unixTimeToEnclosingSlot,
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

const wallet1Address = (await wallet1.getUnusedAddresses())[0];

const blueprint = JSON.parse(fs.readFileSync("./plutus.json"));

// Resolve validators BY TITLE rather than a fixed index: the validator order in
// plutus.json changes when validators are added/removed, and a hard-coded index
// previously pointed this script's WALLET leg at the always-fail
// reference-store validator, permanently stranding the funds (see
// lock-example.mjs for the same fix).
function validatorByTitle(title) {
  const validator = blueprint.validators.find((v) => v.title === title);
  if (!validator) {
    throw new Error(`${title} not found in plutus.json — run \`aiken build\`.`);
  }
  return validator;
}

const script = {
  code: applyParamsToScript(validatorByTitle("stt.stt.spend").compiledCode, []),
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
async function fetchUtxo(txHash, scriptAddressToFetch) {
  console.log(`Fetching UTxO with txHash: ${txHash}`);
  const utxos = await blockchainProvider.fetchAddressUTxOs(
    scriptAddressToFetch
  );
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
  "ec0dba268eedb3a01d7fe25fa9287e7520f441fdfe2666ebfe816f99ed922091",
  scriptAddress
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

// State layout (see `lib/state/types.ak`): nested AccessControl +
// ProofOfLifeSettings groups, then streaming_payments, wallet_name,
// intended_stake_credential and last_permissionless_payout_at.
// The previous inline streaming-payment fixture used the pre-rename flat
// layout with a raw key hash for `payout_address` (now an `Address`); it is
// dropped here. Encode a real StreamingPayment per `lib/streaming_payments/
// types.ak` (its `payout_address` is a Cardano `Address`) when one is needed.
//
// Operator `Use` must PRESERVE `intended_stake_credential` and
// `last_permissionless_payout_at` (enforced centrally in `eval_spend`), so the
// two trailing `None`s are only correct against an STT minted with both unset
// (the `mint_state_token.mjs` default). If your input datum carries other
// values, forward them unchanged.
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

const parameters = [
  //stt_policy_id
  "ab590bf0dfe4113dc719a4ed90c167b076af7885d70ca625624ceb8f",
  //asset_name
  "35e9b428274a8e4db75806e312f267d18f9d2133ba9b67a689f7b605536d0519",
];

const parameterizedPlutusScriptCbor2 = applyParamsToScript(
  validatorByTitle("wallet.wallet.spend").compiledCode,
  parameters
);

const script2 = {
  code: parameterizedPlutusScriptCbor2,
  version: "V3",
};
const scriptAddress2 = resolvePlutusScriptAddress(script2, 0);
console.log("wallet script address", scriptAddress2);
const utxoLocked = await fetchUtxo(
  "1d2787f2c9da0fc57eaabdbab04571c48b3ce861e38ee038a7f77e722a408719",
  scriptAddress2
);

if (utxoLocked.length === 0) {
  throw new Error("No UTXOs found in the wallet. Wallet is empty.");
}
console.log("utxosLocked", utxoLocked);

console.log("New datum:", JSON.stringify(datum, null, 2));

// Create the redeemer — SttAction::RunOperator(OperatorAction { Admin, Use }).
// OperatorAction = Constr 0 [OperatorPath, OperatorActionKind];
// OperatorPath::Admin = Constr 0, OperatorActionKind::Use = Constr 0.
const redeemer = {
  data: {
    alternative: 0,
    fields: [
      {
        alternative: 0,
        fields: [
          { alternative: 0, fields: [] },
          { alternative: 0, fields: [] },
        ],
      },
    ],
  },
};

// Set validity interval
const invalidBefore =
  unixTimeToEnclosingSlot(Date.now() - 150000, SLOT_CONFIG_NETWORK.preprod) - 1;
const invalidHereafter =
  unixTimeToEnclosingSlot(Date.now() + 150000, SLOT_CONFIG_NETWORK.preprod) + 1;

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

tx.redeemValue({
  value: utxoLocked,
  script: script2,
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
tx.sendLovelace(scriptAddress2, "5000000");
tx.sendLovelace(wallet1Address, "5000000");
// Set transaction parameters
tx.setChangeAddress(address).setRequiredSigners([address]);

//console.log("tx", tx);

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
