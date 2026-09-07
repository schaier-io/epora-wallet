import assert from "node:assert/strict";
import test from "node:test";
import { readWalletAuthorityAddress } from "./authority-address";

const wallet = (used: string[], unused: string[]) => ({
  getUsedAddresses: async () => used,
  getUnusedAddresses: async () => unused,
  getChangeAddress: async () => "change"
});

test("authority selection matches the UI order without adding every owned address", async () => {
  assert.equal(await readWalletAuthorityAddress(wallet(["used", "other"], ["unused"])), "used");
  assert.equal(await readWalletAuthorityAddress(wallet([], ["unused", "other"])), "unused");
  assert.equal(await readWalletAuthorityAddress(wallet([], [])), "change");
});

test("identity failures and missing APIs never fall through to a different key", async () => {
  await assert.rejects(readWalletAuthorityAddress({
    ...wallet([], []), getUsedAddresses: async () => { throw new Error("account changed"); }
  }), /account changed/);
  await assert.rejects(readWalletAuthorityAddress({
    ...wallet([], []), getUnusedAddresses: async () => { throw new Error("access revoked"); }
  }), /access revoked/);
  const missingApi = { getChangeAddress: async () => "change" };
  await assert.rejects(readWalletAuthorityAddress(missingApi as Parameters<typeof readWalletAuthorityAddress>[0]), TypeError);
});
