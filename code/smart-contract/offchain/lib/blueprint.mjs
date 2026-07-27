// Shared, side-effect-free contract plumbing for the off-chain scripts:
// blueprint loading, validator lookup by title, script/address/policy-id
// derivation, and STT asset-name derivation.
//
// Every script used to inline its own copy of this. That made the one thing
// worth testing — that the titles the scripts ask for still exist, and that the
// asset name they derive matches what `lib/stt/io.output_reference_to_asset_name`
// computes on-chain — untestable, so CI could only check that the files parse.
// Keeping it here and free of wallets, providers and network I/O is what lets
// `offchain/test/` assert against the committed plutus.json in milliseconds.
import fs from "node:fs";
import { applyParamsToScript, resolvePlutusScriptAddress } from "@meshsdk/core";
import { deserializePlutusScript } from "@meshsdk/core-cst";
import { blake2b } from "ethereum-cryptography/blake2b.js";

/** Every validator title the off-chain scripts resolve. */
export const REQUIRED_VALIDATOR_TITLES = [
  "stt.stt.mint",
  "stt.stt.spend",
  "wallet.wallet.spend",
];

export function loadBlueprint(path = "./plutus.json") {
  return JSON.parse(fs.readFileSync(path));
}

/**
 * Resolve a validator BY TITLE rather than by index: the validator order in
 * plutus.json changes when validators are added or removed, and a hard-coded
 * index previously pointed scripts at the always-fail reference-store
 * validator.
 */
export function validatorByTitle(blueprint, title) {
  const validator = blueprint.validators.find((v) => v.title === title);
  if (!validator) {
    throw new Error(`${title} not found in plutus.json — run \`aiken build\`.`);
  }
  return validator;
}

/** The Plutus V3 script for `title`, with `params` applied. */
export function plutusScript(blueprint, title, params = []) {
  return {
    code: applyParamsToScript(validatorByTitle(blueprint, title).compiledCode, params),
    version: "V3",
  };
}

/**
 * The script's own address. Always enterprise (no stake credential), matching
 * the `intended_stake_credential: None` default the State carries at mint.
 */
export function scriptAddress(script, networkId = 0) {
  return resolvePlutusScriptAddress(script, networkId);
}

export function policyIdOf(script) {
  return deserializePlutusScript(script.code, script.version).hash().toString();
}

/**
 * The STT asset name for a seed UTxO, derived exactly as the validator does in
 * `lib/stt/io.output_reference_to_asset_name`:
 *
 *   blake2b_256(transaction_id ++ big_endian_4_bytes(output_index))
 *
 * The 4-byte fixed width is load-bearing — a variable-width encoding could let
 * two different (tx_id, index) pairs share a preimage. Keep this in lockstep
 * with the Aiken definition; `offchain/test/blueprint.test.mjs` pins the same
 * vector the contract test suite pins.
 */
export function sttAssetName(transactionId, outputIndex) {
  const preimage = transactionId + outputIndex.toString(16).padStart(8, "0");
  return Buffer.from(blake2b(Buffer.from(preimage, "hex"), 32)).toString("hex");
}
