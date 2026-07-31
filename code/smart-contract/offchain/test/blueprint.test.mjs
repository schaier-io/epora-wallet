// Executable coverage for the off-chain contract plumbing. Before this the CI
// gate for offchain/ was `node --check` — a parse check — so a renamed
// validator, a re-ordered blueprint or a drifted asset-name derivation stayed
// invisible until a script died mid-transaction against a live testnet.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_VALIDATOR_TITLES,
  loadBlueprint,
  plutusScript,
  policyIdOf,
  scriptAddress,
  sttAssetName,
  validatorByTitle,
} from "../lib/blueprint.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const blueprint = loadBlueprint(join(projectRoot, "plutus.json"));

test("every validator title the scripts resolve exists in the blueprint", () => {
  for (const title of REQUIRED_VALIDATOR_TITLES) {
    assert.ok(
      validatorByTitle(blueprint, title).compiledCode,
      `${title} has no compiledCode`,
    );
  }
});

test("a missing title fails with the actionable message", () => {
  assert.throws(
    () => validatorByTitle(blueprint, "stt.stt.nonexistent"),
    /not found in plutus\.json — run `aiken build`\./,
  );
});

test("the STT and wallet validators derive distinct addresses", () => {
  const stt = scriptAddress(plutusScript(blueprint, "stt.stt.spend"));
  const wallet = scriptAddress(plutusScript(blueprint, "wallet.wallet.spend", []));

  assert.match(stt, /^addr_test1/);
  assert.match(wallet, /^addr_test1/);
  assert.notEqual(
    stt,
    wallet,
    "STT and wallet must not share an address — the two validators guard different UTxOs",
  );
});

test("address derivation is deterministic and network-scoped", () => {
  const script = plutusScript(blueprint, "stt.stt.spend");

  assert.equal(scriptAddress(script, 0), scriptAddress(script, 0));
  assert.notEqual(
    scriptAddress(script, 0),
    scriptAddress(script, 1),
    "testnet and mainnet addresses must differ",
  );
});

test("the STT mint policy id is the mint validator's own hash", () => {
  const policyId = policyIdOf(plutusScript(blueprint, "stt.stt.mint"));

  assert.match(policyId, /^[0-9a-f]{56}$/, "a policy id is a 28-byte hash");
});

// The on-chain counterpart is `lib/stt/io.output_reference_to_asset_name`:
//   blake2b_256(transaction_id ++ big_endian_4_bytes(output_index))
// The seed reference below is `test_support/security_fixtures.stt_input_ref()`,
// the same one the contract suite derives from, so a drift on either side of
// the boundary breaks a test rather than a live mint.
const SEED_TX_ID =
  "5230000000000000000000000000000000000000000000000000000000000000";

test("STT asset names match the on-chain derivation", () => {
  const assetName = sttAssetName(SEED_TX_ID, 0);

  assert.match(assetName, /^[0-9a-f]{64}$/, "blake2b-256 is 32 bytes");
  assert.equal(assetName, EXPECTED_STT_ASSET_NAME);
});

test("the output index is part of the preimage at a fixed 4-byte width", () => {
  // A variable-width encoding would let (tx_id, index) pairs collide; these
  // three must all differ.
  const names = [0, 1, 256].map((index) => sttAssetName(SEED_TX_ID, index));

  assert.equal(new Set(names).size, 3);
});

// Pinned vector — regenerate ONLY alongside a deliberate change to the on-chain
// derivation, and change both sides in the same commit. The contract suite pins
// the identical value in
// `validators/stt_mint_tests.ak::stt_asset_name_derivation_matches_offchain_vector`.
const EXPECTED_STT_ASSET_NAME =
  "5c0a12f71dcc48f4c457a1a4a2ca08edf40841076d65481e4ab1a93c829c7e17";
