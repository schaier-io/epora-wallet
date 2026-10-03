import assert from "node:assert/strict";
import test from "node:test";
import { applyParamsToScript, resolvePlutusScriptAddress, resolveScriptHash } from "@meshsdk/core";
import blueprint from "@/lib/contracts/plutus.json";

import {
  getSttMintScript,
  getSttMintPolicyId,
  getWalletSpendScript,
  getWalletWithdrawScript,
  getWalletPublishScript,
  getWalletVoteScript,
  resolveWalletSpendScriptHash,
  resolveScriptAddress
} from "@/lib/contracts/blueprint";

test("resolveScriptAddress uses the requested Cardano network", () => {
  const script = getSttMintScript();

  assert.match(resolveScriptAddress(script, "preprod"), /^addr_test1/);
  assert.match(resolveScriptAddress(script, "preview"), /^addr_test1/);
  assert.match(resolveScriptAddress(script, "mainnet"), /^addr1/);
});

test("cached derivations preserve installed SDK script, hash and address outputs", () => {
  const params = { sttPolicyId: "ab".repeat(28), sttAssetNameHex: "00" };
  const entries = [
    ["stt.stt.spend", () => getSttMintScript(), []],
    ["wallet.wallet.spend", () => getWalletSpendScript(params), [params.sttPolicyId, params.sttAssetNameHex]],
    ["wallet.wallet.withdraw", () => getWalletWithdrawScript(params), [params.sttPolicyId, params.sttAssetNameHex]],
    ["wallet.wallet.publish", () => getWalletPublishScript(params), [params.sttPolicyId, params.sttAssetNameHex]],
    ["wallet.wallet.vote", () => getWalletVoteScript(params), [params.sttPolicyId, params.sttAssetNameHex]]
  ] as const;
  for (const [title, getScript, scriptParams] of entries) {
    const compiledCode = blueprint.validators.find(entry => entry.title === title)!.compiledCode;
    const expected = { code: applyParamsToScript(compiledCode, [...scriptParams]), version: "V3" as const };
    assert.deepEqual(getScript(), expected);
    assert.deepEqual(getScript(), expected);
    for (const network of ["preprod", "mainnet"] as const) {
      assert.equal(resolveScriptAddress(getScript(), network), resolvePlutusScriptAddress(expected, network === "mainnet" ? 1 : 0));
    }
  }
  const stt = getSttMintScript();
  assert.equal(getSttMintPolicyId(), resolveScriptHash(stt.code, stt.version));
  const wallet = getWalletSpendScript(params);
  assert.equal(resolveWalletSpendScriptHash(params), resolveScriptHash(wallet.code, wallet.version));
});
