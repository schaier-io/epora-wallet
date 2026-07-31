import { test } from "node:test";
import assert from "node:assert/strict";
import { shortenAddress, shortenIdentifier } from "./explorer";

test("shortenIdentifier truncates the middle, keeping ends", () => {
  const hash = "a".repeat(20) + "b".repeat(20);
  assert.equal(shortenIdentifier(hash, 10, 6), `${"a".repeat(10)}...${"b".repeat(6)}`);
});

test("shortenIdentifier passes short values through unchanged", () => {
  assert.equal(shortenIdentifier("abcdef", 10, 8), "abcdef");
});

test("shortenIdentifier renders empty values as a dash", () => {
  assert.equal(shortenIdentifier(null), "-");
  assert.equal(shortenIdentifier(undefined), "-");
  assert.equal(shortenIdentifier(""), "-");
});

test("shortenAddress keeps 12 leading and 8 trailing characters", () => {
  const address = "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9";
  const shortened = shortenAddress(address);
  assert.equal(shortened, "addr_test1qr...ve4x5uh9");
});
