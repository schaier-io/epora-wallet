import assert from "node:assert/strict";
import test from "node:test";
import { bech32Decode, bech32Encode, convertBits } from "./bech32";

const PAYMENT_ADDRESS =
  "addr_test1qqpuggk9mxuwfc2me4nqaaay0tkjyd8czx9udeesc4ux42gy6nc6cptzv8dusc4d4ae2pt5ld9u4xgdh6vekt6k04huqtu9ru2";
const REWARD_ADDRESS = "stake_test17pdwchy8ae9635fw8y9skl977rv27pp7yyx3wnrhdmhaf4qaj0and";

// Decode outputs verified against `deserializeAddress` / `serializeRewardAddress`
// from `@meshsdk/core` 1.9.1.
test("decodes a real preprod payment address to its bytes", () => {
  const decoded = bech32Decode(PAYMENT_ADDRESS);
  assert.ok(decoded);
  assert.equal(decoded.hrp, "addr_test");
  assert.equal(decoded.bytes[0], 0x00);
  assert.equal(decoded.bytes.length, 57);
});

test("round-trips a reward address through encode", () => {
  const decoded = bech32Decode(REWARD_ADDRESS);
  assert.ok(decoded);
  assert.equal(bech32Encode(decoded.hrp, decoded.bytes), REWARD_ADDRESS);
});

test("rejects a corrupted checksum", () => {
  const corrupted = PAYMENT_ADDRESS.slice(0, -1) + (PAYMENT_ADDRESS.endsWith("q") ? "p" : "q");
  assert.equal(bech32Decode(corrupted), null);
});

test("rejects mixed casing and junk", () => {
  assert.equal(bech32Decode(PAYMENT_ADDRESS.toUpperCase().slice(0, 20) + PAYMENT_ADDRESS.toLowerCase().slice(20)), null);
  assert.equal(bech32Decode(""), null);
  assert.equal(bech32Decode("addr_test1"), null);
  assert.equal(bech32Decode("notbech32"), null);
});

test("convertBits regroups 8-bit bytes into 5-bit groups and back", () => {
  const bytes = [0x00, 0xff, 0x12, 0x34, 0x56];
  const groups = convertBits(bytes, 8, 5, true);
  assert.ok(groups);
  assert.ok(groups.every(value => value >= 0 && value < 32));
  assert.deepEqual(convertBits(groups, 5, 8, false), bytes);
});

test("convertBits rejects non-zero padding on decode", () => {
  assert.equal(convertBits([31], 5, 8, false), null);
  assert.equal(convertBits([32], 5, 8, false), null);
});
