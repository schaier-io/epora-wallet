import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POLICY_ID_LENGTH,
  hexToAscii,
  resolveAssetIdentity,
  splitAssetUnit
} from "./cardano-assets";

test("hexToAscii decodes printable ASCII", () => {
  assert.equal(hexToAscii("5553444d"), "USDM");
});

test("hexToAscii returns input unchanged for non-printable bytes", () => {
  assert.equal(hexToAscii("0014df10"), "0014df10");
});

test("hexToAscii returns input unchanged for odd-length or non-hex input", () => {
  assert.equal(hexToAscii("abc"), "abc");
  assert.equal(hexToAscii("zz"), "zz");
  assert.equal(hexToAscii(""), "");
});

test("splitAssetUnit splits policy id and asset name at the policy length", () => {
  const policyId = "f".repeat(POLICY_ID_LENGTH);
  const { policyId: p, assetNameHex } = splitAssetUnit(`${policyId}5553444d`);
  assert.equal(p, policyId);
  assert.equal(assetNameHex, "5553444d");
});

test("splitAssetUnit treats lovelace and short units specially", () => {
  assert.deepEqual(splitAssetUnit("lovelace"), { policyId: "", assetNameHex: "" });
  assert.deepEqual(splitAssetUnit("abc"), { policyId: "", assetNameHex: "abc" });
});

test("resolveAssetIdentity resolves ADA and known symbols", () => {
  assert.equal(resolveAssetIdentity("lovelace").symbol, "ADA");
  const policyId = "f".repeat(POLICY_ID_LENGTH);
  // 0014df10 CIP-67 FT prefix + "USDM"
  const usdm = resolveAssetIdentity(`${policyId}0014df105553444d`);
  assert.equal(usdm.symbol, "USDM");
  assert.equal(usdm.knownMeta?.accent, "stable");
});

test("resolveAssetIdentity keeps the raw hex as symbol for non-printable names", () => {
  const policyId = "f".repeat(POLICY_ID_LENGTH);
  const identity = resolveAssetIdentity(`${policyId}00ff00ff`);
  assert.equal(identity.symbol, "00ff00ff");
  assert.equal(identity.knownMeta, null);
});

test("resolveAssetIdentity falls back to shortened unit when the name is empty", () => {
  const policyOnlyUnit = "f".repeat(POLICY_ID_LENGTH);
  const identity = resolveAssetIdentity(policyOnlyUnit);
  assert.ok(identity.symbol.includes("..."));
  assert.equal(identity.decodedAssetName, "");
});
