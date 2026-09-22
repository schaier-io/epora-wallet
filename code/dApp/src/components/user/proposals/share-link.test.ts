import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildInviteMailtoUrl,
  buildInviteSmsUrl,
  buildProposalShareUrl,
  buildSignerInviteUrl
} from "./share-link";

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

test("the invite link carries the wallet and no request", () => {
  assert.equal(
    buildSignerInviteUrl("http://localhost:3000", WALLET),
    `http://localhost:3000/user/proposals?wallet=${WALLET}`
  );
});

// An invite with no wallet is still a working sign-in link, so it must not end in a bare
// `?`, which some clients drop and others carry into the address bar as a dead parameter.
test("an invite with no wallet has no query string at all", () => {
  assert.equal(buildSignerInviteUrl("https://epora.example/", ""), "https://epora.example/user/proposals");
});

// `URLSearchParams` would write these spaces as `+`, which a mail client shows literally.
test("a mail draft encodes spaces as %20, not +", () => {
  assert.equal(
    buildInviteMailtoUrl("Co-sign with me", "Open this link: https://epora.example/user/proposals?wallet=x"),
    "mailto:?subject=Co-sign%20with%20me&body=Open%20this%20link%3A%20https%3A%2F%2Fepora.example%2Fuser%2Fproposals%3Fwallet%3Dx"
  );
});

test("a mail draft with no subject still carries the body", () => {
  assert.equal(buildInviteMailtoUrl("", "hello there"), "mailto:?body=hello%20there");
});

test("a text draft carries only the body", () => {
  assert.equal(buildInviteSmsUrl("hello there"), "sms:?body=hello%20there");
});

test("an empty draft is the bare scheme, not a dangling question mark", () => {
  assert.equal(buildInviteMailtoUrl("", ""), "mailto:");
  assert.equal(buildInviteSmsUrl(""), "sms:");
});
