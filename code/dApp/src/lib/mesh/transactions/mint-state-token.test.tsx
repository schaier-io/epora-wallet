// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { BrowserWallet, UTxO } from "@meshsdk/core";
import type { MintFormInput } from "@/lib/types/contracts";

// Integration test for a SCRIPT builder: buildMintStateTokenTx mints the STT with
// an inline Plutus minting policy. Unlike lock-funds, the build needs an evaluator
// (ex-units) and manual script collateral, so the mocked ServerFetcher returns a
// mint budget from evaluateTx and there are two wallet UTxOs (mint reference +
// collateral). Real MeshSDK still does the build; only chain I/O is mocked.
vi.mock("@/lib/mesh/server-fetcher", async () => {
  const {
    DEFAULT_PROTOCOL_PARAMETERS,
    DEFAULT_V1_COST_MODEL_LIST,
    DEFAULT_V2_COST_MODEL_LIST,
    DEFAULT_V3_COST_MODEL_LIST
  } = await import("@meshsdk/common");
  class ServerFetcher {
    async fetchProtocolParameters() {
      return DEFAULT_PROTOCOL_PARAMETERS;
    }
    async fetchCostModels() {
      return [DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST];
    }
    async fetchAddressUTxOs() {
      return []; // no shared reference store -> inline script path
    }
    async fetchUTxOs() {
      return [];
    }
    async get(url: string) {
      // The script-data hash refresh reads live cost models from this endpoint.
      if (url.includes("epochs/latest/parameters")) {
        return {
          cost_models_raw: {
            PlutusV1: DEFAULT_V1_COST_MODEL_LIST,
            PlutusV2: DEFAULT_V2_COST_MODEL_LIST,
            PlutusV3: DEFAULT_V3_COST_MODEL_LIST
          }
        };
      }
      return {};
    }
    async evaluateTx() {
      return [{ index: 0, tag: "MINT", budget: { mem: 700_000, steps: 300_000_000 } }];
    }
    async submitTx() {
      return "00".repeat(32);
    }
  }
  return { ServerFetcher };
});

const { buildMintStateTokenTx } = await import("@/lib/mesh/transactions/mint-state-token");
const { createDefaultStateForm, stateFormToDatum, withFallbackAdminUserInStateForm } = await import(
  "@/lib/contracts/state-form"
);

// Real, checksum-valid preprod key-hash address (from key hash "11"*28).
const PAYMENT_ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const ADMIN_KEY_HASH = "ab".repeat(28);

// A valid mint state datum: the default form plus one admin bound to a key hash
// (an admin access path is what validateMintStateDatum requires).
const stateDatum = stateFormToDatum(
  withFallbackAdminUserInStateForm(createDefaultStateForm(), ADMIN_KEY_HASH)
);

function adaUtxo(outputIndex: number): UTxO {
  return {
    input: { txHash: "11".repeat(32), outputIndex },
    output: { address: PAYMENT_ADDRESS, amount: [{ unit: "lovelace", quantity: "100000000" }] }
  } as unknown as UTxO;
}

// Two pure-ADA UTxOs: one is reserved as the mint reference input, the other is
// available for the manual script collateral that minting requires.
const wallet = {
  getUtxos: async () => [adaUtxo(0), adaUtxo(1)],
  getChangeAddress: async () => PAYMENT_ADDRESS,
  getUsedAddresses: async () => [PAYMENT_ADDRESS],
  getUnusedAddresses: async () => []
} as unknown as BrowserWallet;

describe("buildMintStateTokenTx (integration: real MeshSDK build, mocked chain I/O)", () => {
  it("builds a balanced minting transaction for a valid state datum", async () => {
    const input = { stateDatum, mintLovelace: "2000000" } as unknown as MintFormInput;

    const result = await buildMintStateTokenTx(wallet, input);

    expect(result.txHex).toMatch(/^[0-9a-f]+$/i);
    expect(result.estimatedFeeLovelace).toBeDefined();
    expect(BigInt(result.estimatedFeeLovelace ?? "0")).toBeGreaterThan(0n);
    expect(result.preview.action).toBe("mint");
    expect(result.preview.summary).toContain("1 STT under policy");
    expect(result.executionUnits).toBeDefined();
  });

  it("rejects an invalid (empty-access) state datum before building", async () => {
    const emptyDatum = stateFormToDatum(createDefaultStateForm());
    const input = { stateDatum: emptyDatum, mintLovelace: "2000000" } as unknown as MintFormInput;
    await expect(buildMintStateTokenTx(wallet, input)).rejects.toThrow();
  });
});
