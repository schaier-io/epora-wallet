import assert from "node:assert/strict";
import test from "node:test";

import { suggestNewWalletName } from "@/components/user/workspace/helpers/wallet-name";
import { DEFAULT_WALLET_NAME } from "@/lib/contracts/state-wallet-name";

test("suggestNewWalletName returns the plain default when it is free", () => {
  assert.equal(suggestNewWalletName([]), DEFAULT_WALLET_NAME);
  assert.equal(suggestNewWalletName(["Holiday fund"]), DEFAULT_WALLET_NAME);
});

test("suggestNewWalletName skips taken names", () => {
  assert.equal(suggestNewWalletName([DEFAULT_WALLET_NAME]), `${DEFAULT_WALLET_NAME} 2`);
  assert.equal(
    suggestNewWalletName([DEFAULT_WALLET_NAME, `${DEFAULT_WALLET_NAME} 2`]),
    `${DEFAULT_WALLET_NAME} 3`
  );
});

test("suggestNewWalletName never returns a name that already exists", () => {
  // The exact input that broke the old implementation. It scanned 2..99, found
  // every one taken, then returned `length + 1` WITHOUT checking it. With the
  // 2..99 block full and "Smart wallet 101" also taken, `length + 1` is 101 --
  // a name already in use. Confirmed against the pre-fix code, which returns
  // "Smart wallet 101" here.
  const taken = [DEFAULT_WALLET_NAME];
  for (let index = 2; index <= 99; index += 1) {
    taken.push(`${DEFAULT_WALLET_NAME} ${index}`);
  }
  taken.push(`${DEFAULT_WALLET_NAME} 101`);
  assert.equal(taken.length, 100);

  const suggestion = suggestNewWalletName(taken);
  assert.ok(!taken.includes(suggestion), `"${suggestion}" is already taken`);
  assert.equal(suggestion, `${DEFAULT_WALLET_NAME} 100`);
});

test("suggestNewWalletName ignores case and surrounding space when comparing", () => {
  assert.equal(suggestNewWalletName(["  smart WALLET  "]), `${DEFAULT_WALLET_NAME} 2`);
});
