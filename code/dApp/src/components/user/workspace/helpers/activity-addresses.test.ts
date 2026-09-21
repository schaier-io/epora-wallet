import assert from "node:assert/strict";
import { test } from "node:test";
import { bech32Encode } from "@/lib/bech32";
import { createWalletAddressMatcher } from "./activity-addresses";

const PAYMENT_HASH = new Uint8Array(28).fill(0xab);
const STAKE_HASH = new Uint8Array(28).fill(0xcd);
function address(type: number, network = 0, hash = PAYMENT_HASH) {
  return bech32Encode(network === 1 ? "addr" : "addr_test", Uint8Array.of(
    (type << 4) | network, ...hash, ...(type < 4 ? STAKE_HASH : [])
  ));
}

test("script wallet identity ignores key or script staking credentials", () => {
  const matches = createWalletAddressMatcher(address(7));
  assert.equal(matches(address(1)), true);
  assert.equal(matches(address(3)), true);
  assert.equal(createWalletAddressMatcher(address(3))(address(7)), true);
});

test("different payment scripts, payment keys, and networks remain separate", () => {
  const matches = createWalletAddressMatcher(address(7));
  assert.equal(matches(address(7, 0, STAKE_HASH)), false);
  assert.equal(matches(address(6)), false);
  assert.equal(matches(address(0)), false);
  assert.equal(matches(address(7, 1)), false);
  assert.equal(matches(address(7, 2)), false);
});

test("invalid addresses match only the identical string", () => {
  const matches = createWalletAddressMatcher("addr_test1fixture");
  assert.equal(matches("addr_test1fixture"), true);
  assert.equal(matches("addr_test1other"), false);
  assert.equal(matches(address(7)), false);
  assert.equal(createWalletAddressMatcher(address(7))("addr_test1fixture"), false);
});

test("malformed lengths, checksums and network prefixes cannot match a wallet", () => {
  const matches = createWalletAddressMatcher(address(7));
  assert.equal(matches(bech32Encode("addr_test", Uint8Array.of(0x10, ...PAYMENT_HASH))), false);
  assert.equal(matches(bech32Encode("addr_test", Uint8Array.of(0x70, ...PAYMENT_HASH, 0))), false);
  assert.equal(matches(bech32Encode("addr", Uint8Array.of(0x70, ...PAYMENT_HASH))), false);
  const valid = address(1);
  assert.equal(matches(valid.slice(0, -1) + (valid.endsWith("q") ? "p" : "q")), false);
});
