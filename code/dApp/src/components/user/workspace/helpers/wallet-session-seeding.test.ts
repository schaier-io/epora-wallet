import assert from "node:assert/strict";
import test from "node:test";
import { resolveWalletToSeed } from "./wallet-session-seeding";
import type { DetectedSttToken } from "@/lib/mesh/detection";

const POLICY = "67c11430b30ec8d03c2cce22b149265fef3c866af5b364568185f93c";
const NAME = "4a54e32392a501ce0018aff2175012cfc7d19183ae6a3d87dc0bfa7e703d95ae";
const UNIT = `${POLICY}${NAME}`;

const TOKEN = {
  policyId: POLICY,
  assetNameHex: NAME,
  unit: UNIT,
  scriptAddress: "addr_test1wqstt",
  utxo: { input: { txHash: "f8482092", outputIndex: 0 }, output: { address: "addr_test1wqstt", amount: [] } },
  datum: null
} as unknown as DetectedSttToken;

const EMPTY_CONFIG = { walletPolicyId: "", walletAssetNameHex: "" };
const SEEDED_CONFIG = { walletPolicyId: POLICY, walletAssetNameHex: NAME };

/**
 * The regression: a link carrying `?wallet=<unit>` set the selection without seeding config,
 * and the old guard treated a set selection as proof the wallet was already open. The wallet
 * showed as Opened with no address, because config still had no asset name to derive one from.
 */
test("seeds a wallet named by the URL that config does not describe yet", () => {
  const token = resolveWalletToSeed({
    detectedTokens: [TOKEN],
    selectedUnit: UNIT,
    defaultUnit: UNIT,
    config: EMPTY_CONFIG
  });

  assert.equal(token?.unit, UNIT);
});

test("seeds the default wallet when nothing is selected yet", () => {
  const token = resolveWalletToSeed({
    detectedTokens: [TOKEN],
    selectedUnit: "",
    defaultUnit: UNIT,
    config: EMPTY_CONFIG
  });

  assert.equal(token?.unit, UNIT);
});

test("does nothing once config already describes the open wallet", () => {
  assert.equal(
    resolveWalletToSeed({
      detectedTokens: [TOKEN],
      selectedUnit: UNIT,
      defaultUnit: UNIT,
      config: SEEDED_CONFIG
    }),
    null
  );
});

test("re-seeds when config still describes the previous wallet", () => {
  const token = resolveWalletToSeed({
    detectedTokens: [TOKEN],
    selectedUnit: UNIT,
    defaultUnit: UNIT,
    config: { walletPolicyId: POLICY, walletAssetNameHex: "0000" }
  });

  assert.equal(token?.unit, UNIT);
});

test("does nothing while the named wallet has not been detected yet", () => {
  assert.equal(
    resolveWalletToSeed({
      detectedTokens: [],
      selectedUnit: UNIT,
      defaultUnit: UNIT,
      config: EMPTY_CONFIG
    }),
    null
  );
});

test("does nothing when no wallet is named and there is no default", () => {
  assert.equal(
    resolveWalletToSeed({
      detectedTokens: [TOKEN],
      selectedUnit: "",
      defaultUnit: null,
      config: EMPTY_CONFIG
    }),
    null
  );
});
