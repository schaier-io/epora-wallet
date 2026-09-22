import assert from "node:assert/strict";
import test from "node:test";
import { bech32Encode } from "./bech32";
import { serializeScriptDrepId, serializeScriptRewardAddress, testnetPaymentCredentialHash } from "./cardano-addresses";

const SCRIPT_HASH = "5aec5c87ee4ba8d12e390b0b7cbef0d8af043e210d174c776eefd4d4";
const KEY_PAYMENT_ADDRESS =
  "addr_test1qqpuggk9mxuwfc2me4nqaaay0tkjyd8czx9udeesc4ux42gy6nc6cptzv8dusc4d4ae2pt5ld9u4xgdh6vekt6k04huqtu9ru2";
const KEY_PAYMENT_HASH = "03c422c5d9b8e4e15bcd660ef7a47aed2234f8118bc6e730c5786aa9";
// Enterprise script address (CIP-19 header 0x70) built from the same script hash.
const SCRIPT_PAYMENT_ADDRESS = "addr_test1wpdwchy8ae9635fw8y9skl977rv27pp7yyx3wnrhdmhaf4qa639y8";

// Expected addresses verified against `serializeRewardAddress(hash, true, networkId)`
// from `@meshsdk/core` 1.9.1.
test("encodes a script reward address exactly like the Mesh helper", () => {
  assert.equal(
    serializeScriptRewardAddress(SCRIPT_HASH, 0),
    "stake_test17pdwchy8ae9635fw8y9skl977rv27pp7yyx3wnrhdmhaf4qaj0and"
  );
  assert.equal(
    serializeScriptRewardAddress(SCRIPT_HASH, 1),
    "stake179dwchy8ae9635fw8y9skl977rv27pp7yyx3wnrhdmhaf4q6c9lhs"
  );
});

test("rejects a malformed script hash like the Mesh helper does", () => {
  assert.throws(() => serializeScriptRewardAddress("zz", 0));
  assert.throws(() => serializeScriptRewardAddress(`${SCRIPT_HASH}00`, 0));
  assert.throws(() => serializeScriptRewardAddress("not-hex-at-all-0000000000000000000000000", 0));
});

test("extracts the payment key hash from a preprod payment address", () => {
  assert.equal(testnetPaymentCredentialHash(KEY_PAYMENT_ADDRESS), KEY_PAYMENT_HASH);
});

test("extracts the script hash from an enterprise script address", () => {
  assert.equal(testnetPaymentCredentialHash(SCRIPT_PAYMENT_ADDRESS), SCRIPT_HASH);
});

test("returns null for stake, mainnet-header, and mistyped addresses", () => {
  // A reward address has no payment part, and the editor only converts payment addresses.
  assert.equal(
    testnetPaymentCredentialHash("stake_test17pdwchy8ae9635fw8y9skl977rv27pp7yyx3wnrhdmhaf4qaj0and"),
    null
  );
  // Mainnet network id in the header, wearing a testnet HRP: Mesh accepted
  // this and extracted the hash; we reject it and keep the raw text.
  const mainnetHeader = bech32Encode(
    "addr_test",
    Uint8Array.of(0x71, ...Buffer.from(SCRIPT_HASH, "hex"))
  );
  assert.equal(testnetPaymentCredentialHash(mainnetHeader), null);
  // Checksum damage must never yield a hash.
  assert.equal(testnetPaymentCredentialHash(`${KEY_PAYMENT_ADDRESS.slice(0, -2)}qq`), null);
  assert.equal(testnetPaymentCredentialHash(""), null);
  assert.equal(testnetPaymentCredentialHash("addr_test1"), null);
});

// The preprod wallet from the 2026-08-31 API sweep (tasks/subtasks/m3-api-09-tx-routes.md):
// its vote built with this DRep id, and its reward address carries the same script hash.
test("encodes the wallet's script DRep id as CIP-129", () => {
  const walletScriptHash = "e9dcbf89a50c1d86f196cdb4f483d25fc0aaec071d29954516d0cf98";
  assert.equal(
    serializeScriptRewardAddress(walletScriptHash, 0),
    "stake_test17r5ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqhfkys0"
  );
  assert.equal(
    serializeScriptDrepId(walletScriptHash),
    "drep1y05ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqdjsap6"
  );
  assert.throws(() => serializeScriptDrepId("zz"));
});
