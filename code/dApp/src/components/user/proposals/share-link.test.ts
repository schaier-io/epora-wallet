import { test } from "node:test";
import assert from "node:assert/strict";

import { buildProposalShareUrl } from "./share-link";

const WALLET = `${"aa".repeat(28)}01`;

test("the link carries the wallet as well as the request", () => {
  assert.equal(
    buildProposalShareUrl("http://localhost:3000", WALLET, "proposal-1"),
    `http://localhost:3000/user/proposals?wallet=${WALLET}&proposal=proposal-1`
  );
});

// Without the wallet the recipient lands on whichever wallet the app auto-picks, so the
// parameter order matters less than its presence, but an empty unit must not produce
// `wallet=`, which reads as "this request belongs to no wallet".
test("an unknown wallet is left out rather than sent empty", () => {
  assert.equal(
    buildProposalShareUrl("http://localhost:3000", "", "proposal-1"),
    "http://localhost:3000/user/proposals?proposal=proposal-1"
  );
});

test("a trailing slash on the origin does not double up", () => {
  assert.equal(
    buildProposalShareUrl("https://epora.example/", WALLET, "p2"),
    `https://epora.example/user/proposals?wallet=${WALLET}&proposal=p2`
  );
});

test("ids that need escaping are escaped", () => {
  assert.equal(
    buildProposalShareUrl("https://epora.example", "", "a b&c"),
    "https://epora.example/user/proposals?proposal=a+b%26c"
  );
});
