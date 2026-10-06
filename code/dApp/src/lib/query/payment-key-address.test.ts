import assert from "node:assert/strict";
import test from "node:test";
import { bech32Encode } from "@/lib/bech32";
import { serializePaymentKeyCredential } from "@/lib/cardano-addresses";
import { soleAddressForPaymentKey } from "./payment-key-address";

const KEY_HASH = "03c422c5d9b8e4e15bcd660ef7a47aed2234f8118bc6e730c5786aa9";
// Base address under KEY_HASH; Blockfrost preprod returned it for the credential below.
const BASE_ADDRESS =
  "addr_test1qqpuggk9mxuwfc2me4nqaaay0tkjyd8czx9udeesc4ux42gy6nc6cptzv8dusc4d4ae2pt5ld9u4xgdh6vekt6k04huqtu9ru2";
// The same key with no stake part: a second, different address.
const ENTERPRISE_ADDRESS = bech32Encode("addr_test", Uint8Array.of(0x60, ...Buffer.from(KEY_HASH, "hex")));
const OTHER_KEY_ADDRESS = bech32Encode("addr_test", Uint8Array.of(0x60, ...Buffer.from("ab".repeat(28), "hex")));

test("encodes a payment key hash as the addr_vkh credential Blockfrost accepts", () => {
  // Blockfrost preprod answered HTTP 200 for this credential with UTxOs at BASE_ADDRESS.
  assert.equal(serializePaymentKeyCredential(KEY_HASH), "addr_vkh1q0zz93wehrjwzk7dvc800fr6a53rf7q330rwwvx90p42j89g4nd");
  assert.equal(serializePaymentKeyCredential(KEY_HASH.toUpperCase()), serializePaymentKeyCredential(KEY_HASH));
  assert.throws(() => serializePaymentKeyCredential("zz"));
});

test("names the address when every UTxO sits at one address", () => {
  const rows = [{ address: BASE_ADDRESS }, { address: BASE_ADDRESS }];
  assert.equal(soleAddressForPaymentKey(KEY_HASH, rows), BASE_ADDRESS);
  assert.equal(soleAddressForPaymentKey(KEY_HASH.toUpperCase(), rows), BASE_ADDRESS);
});

test("names nothing when the key sits under two addresses", () => {
  assert.equal(soleAddressForPaymentKey(KEY_HASH, [{ address: BASE_ADDRESS }, { address: ENTERPRISE_ADDRESS }]), null);
});

test("names nothing for a key with no UTxOs or a malformed answer", () => {
  assert.equal(soleAddressForPaymentKey(KEY_HASH, []), null);
  assert.equal(soleAddressForPaymentKey(KEY_HASH, null), null);
  assert.equal(soleAddressForPaymentKey(KEY_HASH, { error: "Not Found" }), null);
  assert.equal(soleAddressForPaymentKey(KEY_HASH, [null, { address: 7 }]), null);
});

test("ignores rows whose payment part is another key", () => {
  assert.equal(soleAddressForPaymentKey(KEY_HASH, [{ address: OTHER_KEY_ADDRESS }]), null);
  assert.equal(soleAddressForPaymentKey(KEY_HASH, [{ address: OTHER_KEY_ADDRESS }, { address: BASE_ADDRESS }]), BASE_ADDRESS);
});
