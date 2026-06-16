import assert from "node:assert/strict";
import test from "node:test";
import type { ContractConfig } from "@/lib/types/contracts";
import {
  getValidityWindow,
  isPureLovelaceUtxo,
  resolveSttScriptParams
} from "@/lib/mesh/transactions/internals/core";
import type { UTxO } from "@meshsdk/core";

function config(overrides: Partial<ContractConfig>): ContractConfig {
  return { sttAssetNameHex: "", ...overrides } as unknown as ContractConfig;
}

function lovelaceUtxo(
  quantity: string,
  opts: { scriptRef?: string; extraAsset?: boolean } = {}
): UTxO {
  const amount = [{ unit: "lovelace", quantity }];
  if (opts.extraAsset) {
    amount.push({ unit: `${"ab".repeat(28)}01`, quantity: "1" });
  }
  return {
    input: { txHash: "a".repeat(64), outputIndex: 0 },
    output: {
      address: "addr_test1qexample",
      amount,
      ...(opts.scriptRef !== undefined ? { scriptRef: opts.scriptRef } : {})
    }
  } as UTxO;
}

test("resolveSttScriptParams prefers wallet params, trims, and falls back to the STT asset name", () => {
  assert.deepEqual(
    resolveSttScriptParams(config({ walletPolicyId: "  pol  ", walletAssetNameHex: "  asset  " })),
    { sttPolicyId: "pol", sttAssetNameHex: "asset" }
  );
  // walletAssetNameHex absent -> uses sttAssetNameHex
  assert.deepEqual(
    resolveSttScriptParams(config({ walletPolicyId: "pol", sttAssetNameHex: "fallback" })),
    { sttPolicyId: "pol", sttAssetNameHex: "fallback" }
  );
});

test("resolveSttScriptParams throws when policy id or asset name is missing", () => {
  assert.throws(
    () => resolveSttScriptParams(config({ walletPolicyId: "", walletAssetNameHex: "asset" })),
    /required/
  );
  assert.throws(
    () => resolveSttScriptParams(config({ walletPolicyId: "pol", walletAssetNameHex: "", sttAssetNameHex: "" })),
    /required/
  );
});

test("isPureLovelaceUtxo accepts ADA-only UTxOs and rejects scripts or multi-asset", () => {
  assert.equal(isPureLovelaceUtxo(lovelaceUtxo("5000000")), true);
  assert.equal(isPureLovelaceUtxo(lovelaceUtxo("5000000", { scriptRef: "abcd" })), false);
  assert.equal(isPureLovelaceUtxo(lovelaceUtxo("5000000", { extraAsset: true })), false);
});

// getValidityWindow drives the on-chain validity interval. Asserted by invariants
// (bracketing/order/determinism/monotonicity) rather than exact slots so it stays
// robust to the network's slot config.
test("getValidityWindow brackets the reference time, ordered, deterministic, and monotonic", () => {
  const reference = 1_750_000_000_000;
  const window = getValidityWindow(reference);

  assert.ok(window.invalidBefore < window.invalidHereafter);
  assert.ok(window.earliestTimeMs <= reference && window.latestTimeMs >= reference);
  // The future margin (240s) is wider than the past margin (120s).
  assert.ok(window.latestTimeMs - reference > reference - window.earliestTimeMs);
  assert.deepEqual(getValidityWindow(reference), window);
  assert.ok(getValidityWindow(reference + 10_000).invalidBefore > window.invalidBefore);
});
