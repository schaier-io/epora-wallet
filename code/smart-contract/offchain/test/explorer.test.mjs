import assert from "node:assert/strict";
import { test } from "node:test";
import { txIdLogText } from "../lib/explorer.mjs";

test("a preprod transaction links to cardanoscan's preprod subdomain", () => {
  assert.equal(
    txIdLogText({ txHash: "abc123", network: "preprod", isDevnet: false }),
    "view on https://preprod.cardanoscan.io/transaction/abc123",
  );
});

test("a devnet transaction prints the bare id with no public-explorer link", () => {
  assert.equal(
    txIdLogText({ txHash: "abc123", network: "preprod", isDevnet: true }),
    "abc123 (local devnet transaction; no public explorer)",
  );
});
