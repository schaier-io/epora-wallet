import assert from "node:assert/strict";
import { test } from "node:test";
import { BlockfrostProvider } from "@meshsdk/core";
import { resolveProvider } from "../lib/network.mjs";

const DEVNET_URL = "http://localhost:8080/api/v1/";
const API_KEY = "preprodExampleKey000000";

test("CARDANO_PROVIDER_URL selects the local devnet over the API key", () => {
  const resolved = resolveProvider({
    CARDANO_PROVIDER_URL: DEVNET_URL,
    BLOCKFROST_API_KEY: API_KEY,
  });
  assert.equal(resolved.isDevnet, true);
  assert.equal(resolved.network, "preprod");
  assert.equal(resolved.networkId, 0);
  assert.ok(resolved.provider instanceof BlockfrostProvider);
});

test("an https devnet URL with surrounding whitespace is accepted", () => {
  const resolved = resolveProvider({
    CARDANO_PROVIDER_URL: "  https://yaci.example/api/v1/  ",
  });
  assert.equal(resolved.isDevnet, true);
  assert.ok(resolved.provider instanceof BlockfrostProvider);
});

test("BLOCKFROST_API_KEY alone keeps the preprod default", () => {
  const resolved = resolveProvider({ BLOCKFROST_API_KEY: API_KEY });
  assert.equal(resolved.isDevnet, false);
  assert.equal(resolved.network, "preprod");
  assert.equal(resolved.networkId, 0);
  assert.ok(resolved.provider instanceof BlockfrostProvider);
});

test("a blank CARDANO_PROVIDER_URL falls back to the API key", () => {
  for (const blank of ["", "   "]) {
    const resolved = resolveProvider({
      CARDANO_PROVIDER_URL: blank,
      BLOCKFROST_API_KEY: API_KEY,
    });
    assert.equal(resolved.isDevnet, false);
  }
});

test("missing provider configuration is rejected before wallet access", () => {
  assert.throws(() => resolveProvider({}), /Missing BLOCKFROST_API_KEY/);
});

for (const [name, value] of [
  ["a bare network name", "preprod"],
  ["a scheme-less host", "localhost:8080/api/v1/"],
  ["a relative path", "/api/v1/"],
  ["a non-http scheme", "ftp://localhost:8080/"],
  ["an uppercase scheme", "HTTP://localhost:8080/api/v1/"],
]) {
  test(`an unusable CARDANO_PROVIDER_URL (${name}) fails instead of targeting the wrong host`, () => {
    assert.throws(
      () => resolveProvider({ CARDANO_PROVIDER_URL: value }),
      /is not a usable provider URL/,
    );
  });
}
