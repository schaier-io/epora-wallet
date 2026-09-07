import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createStore } from "jotai";

import {
  rememberWalletAddressAtom,
  resolvedWalletAddressesAtom
} from "./wallet-address-book";

// The real pair from the test wallets: eternl's "test 2" address and the payment
// key hash the smart wallet's people list actually stores for it.
const TEST2_ADDRESS =
  "addr_test1qqpuggk9mxuwfc2me4nqaaay0tkjyd8czx9udeesc4ux42gy6nc6cptzv8dusc4d4ae2pt5ld9u4xgdh6vekt6k04huqtu9ru2";
const TEST2_HASH = "03c422c5d9b8e4e15bcd660ef7a47aed2234f8118bc6e730c5786aa9";

// The write loads the Mesh SDK on demand (the layout boundary forbids a static
// import), so remembering must be awaited before the book is read.
async function remembered(address: string): Promise<Record<string, string>> {
  const store = createStore();
  await store.set(rememberWalletAddressAtom, address);
  return store.get(resolvedWalletAddressesAtom);
}

afterEach(() => {
  // node has no localStorage, so the atom degrades to its in-memory initial
  // value per store — nothing to clean up between tests.
});

describe("the wallet address book", () => {
  it("files a connected address under the payment key hash a person entry stores", async () => {
    const book = await remembered(TEST2_ADDRESS);

    assert.deepEqual(book, { [TEST2_HASH]: TEST2_ADDRESS });
  });

  it("keeps the address it already knows instead of rewriting it", async () => {
    const store = createStore();
    const stored = { [TEST2_HASH]: "addr_test1older" };
    store.set(resolvedWalletAddressesAtom, stored);

    await store.set(rememberWalletAddressAtom, TEST2_ADDRESS);

    assert.equal(store.get(resolvedWalletAddressesAtom), stored);
  });

  it("ignores addresses that carry no payment key", async () => {
    assert.deepEqual(
      await remembered("stake_test1uqzdfudvq43xrk7gv2k67u4q460kj72nyxmaxvm9at86m7qjwm2yh"),
      {}
    );
  });

  it("ignores anything that is not an address", async () => {
    assert.deepEqual(await remembered("not an address"), {});
    assert.deepEqual(await remembered(""), {});
  });
});
