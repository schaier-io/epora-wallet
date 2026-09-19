import assert from "node:assert/strict";
import test from "node:test";

import { isWalletRejectionMessage } from "./wallet-rejection-patterns";

test("matches the phrasings wallets use for a declined signature prompt", () => {
  const declines = [
    "user declined to sign tx",
    "refused to sign",
    "user refused the request",
    "user rejected",
    "user cancelled",
    "canceled by user",
    "signing cancelled"
  ];
  for (const message of declines) {
    assert.equal(isWalletRejectionMessage(message), true, message);
  }
});

test("keeps signature failures with a different cause", () => {
  assert.equal(isWalletRejectionMessage("DataSignError: key not found"), false);
  assert.equal(isWalletRejectionMessage("plutus script failed"), false);
  assert.equal(isWalletRejectionMessage(""), false);
});
