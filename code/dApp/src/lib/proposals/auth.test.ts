import assert from "node:assert/strict";
import { test } from "node:test";
import {
  issueNonce,
  issueSessionCookieValue,
  verifyNonce,
  verifySessionCookieValue
} from "./auth";

const ADDRESS = "addr_test1qrexampleexampleexampleexampleexampleexampleexampleex";
const OTHER_ADDRESS = "addr_test1qotherotherotherotherotherotherotherotherotherother";

test("a freshly issued nonce verifies for its address", () => {
  const nonce = issueNonce(ADDRESS);
  assert.deepEqual(verifyNonce(nonce, ADDRESS), { ok: true });
});

test("a nonce does not verify for a different address", () => {
  const nonce = issueNonce(ADDRESS);
  const result = verifyNonce(nonce, OTHER_ADDRESS);
  assert.equal(result.ok, false);
});

test("a tampered nonce is rejected", () => {
  const nonce = issueNonce(ADDRESS);
  const tampered = `${nonce}x`;
  assert.equal(verifyNonce(tampered, ADDRESS).ok, false);
});

test("session cookie round-trips the authenticated key hash", () => {
  const cookie = issueSessionCookieValue({ paymentKeyHash: "deadbeef", address: ADDRESS });
  const session = verifySessionCookieValue(cookie);
  assert.deepEqual(session, { paymentKeyHash: "deadbeef", address: ADDRESS });
});

test("a tampered session cookie is rejected", () => {
  const cookie = issueSessionCookieValue({ paymentKeyHash: "deadbeef", address: ADDRESS });
  const [body] = cookie.split(".");
  assert.equal(verifySessionCookieValue(`${body}.forgedsignature`), null);
});

test("an empty cookie value yields no session", () => {
  assert.equal(verifySessionCookieValue(undefined), null);
  assert.equal(verifySessionCookieValue(""), null);
});
