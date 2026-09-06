// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { BrowserWallet, UTxO } from "@meshsdk/core";
import type { MintFormInput } from "@/lib/types/contracts";

// Integration test for a SCRIPT builder: buildMintStateTokenTx mints the STT with
// a referenced Plutus minting policy. Unlike lock-funds, the build needs an evaluator
// (ex-units) and manual script collateral, so the mocked ServerFetcher returns a
// mint budget from evaluateTx and there are two wallet UTxOs (mint reference +
// collateral). Real MeshSDK still does the build; only chain I/O is mocked.
const chain = vi.hoisted(() => ({ references: [] as UTxO[], evaluations: 0 }));
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
      throw new Error("Mint must not scan the shared reference address");
    }
    async fetchUTxOs(hash: string, index?: number) {
      return chain.references.filter((utxo) => utxo.input.txHash === hash &&
        (index === undefined || utxo.input.outputIndex === index));
    }
    async get(url: string) {
      if (url.includes("/utxos")) {
        return { outputs: chain.references.map((utxo) => ({
          output_index: utxo.input.outputIndex, consumed_by_tx: null
        })) };
      }
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
      chain.evaluations += 1;
      return [{ index: 0, tag: "MINT", budget: { mem: 700_000, steps: 300_000_000 } }];
    }
    async submitTx() {
      return "00".repeat(32);
    }
  }
  return { ServerFetcher };
});

const { buildMintStateTokenTx } = await import("@/lib/mesh/transactions/mint-state-token");
const {
  getSttMintPolicyId,
  getSttMintScript,
  resolveSttReferenceStoreAddress,
  resolveWalletSpendAddress
} = await import("@/lib/contracts/blueprint");
const { deriveAssetName } = await import("@/lib/mesh/transactions/internals");
const { resolveScriptHash } = await import("@meshsdk/core");
const { toScriptRef } = await import("@meshsdk/core-cst");
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
  it("requires a shared reference before building an oversized inline mint", async () => {
    chain.references = [];
    chain.evaluations = 0;
    const input = { stateDatum, mintLovelace: "2000000", sttSpendReference: "" } as MintFormInput;
    await expect(buildMintStateTokenTx(wallet, input)).rejects.toThrow(/mint:referenceScript.*setup helper/);
    expect(chain.evaluations).toBe(0);
  });

  it("builds a balanced minting transaction for a valid state datum", async () => {
    const script = getSttMintScript();
    const hash = "22".repeat(32);
    chain.references = [{ input: { txHash: hash, outputIndex: 0 }, output: {
      address: resolveSttReferenceStoreAddress(),
      amount: [{ unit: "lovelace", quantity: "100000000" }],
      scriptRef: String(toScriptRef(script).toCbor()),
      scriptHash: resolveScriptHash(script.code, script.version)
    } }];
    const input = { stateDatum, mintLovelace: "2000000", sttSpendReference: `${hash}#0` } as MintFormInput;

    const result = await buildMintStateTokenTx(wallet, input);

    expect(result.txHex).toMatch(/^[0-9a-f]+$/i);
    expect(result.estimatedFeeLovelace).toBeDefined();
    expect(BigInt(result.estimatedFeeLovelace ?? "0")).toBeGreaterThan(0n);
    expect(result.preview.action).toBe("mint");
    expect(result.preview.summary).toContain("and fund it with");
    expect(result.executionUnits).toBeDefined();
    expect(result.preview.txSize!.usedBytes).toBeLessThanOrEqual(result.preview.txSize!.maxBytes);
  });

  it("rejects an invalid (no-access) state datum at the validation stage", async () => {
    // The default form has no owner/recovery path -> validateMintStateDatum fails,
    // so the builder must throw at that stage (not proceed to build).
    const emptyDatum = stateFormToDatum(createDefaultStateForm());
    const input = { stateDatum: emptyDatum, mintLovelace: "2000000" } as unknown as MintFormInput;
    await expect(buildMintStateTokenTx(wallet, input)).rejects.toThrow(/mint:validateStateDatum/);
  });

  it("rejects a fresh stream under the STT policy before chain evaluation", async () => {
    chain.references = [];
    chain.evaluations = 0;
    const state = withFallbackAdminUserInStateForm(
      createDefaultStateForm(),
      ADMIN_KEY_HASH
    );
    state.streamingPayments = [
      {
        id: "1",
        payoutAddress: PAYMENT_ADDRESS,
        paidOutAmount: "0",
        policyId: getSttMintPolicyId(),
        assetName: "01",
        amountPerDay: "1",
        startDate: "1",
        endDate: "2"
      }
    ];
    const input = {
      stateDatum: stateFormToDatum(state),
      mintLovelace: "2000000"
    } as MintFormInput;

    await expect(buildMintStateTokenTx(wallet, input)).rejects.toThrow(
      /mint:validateStateDatum.*cannot use this wallet's STT policy/i
    );
    expect(chain.evaluations).toBe(0);
  });

  it("rejects a stream to the wallet derived from the selected mint reference", async () => {
    chain.references = [];
    chain.evaluations = 0;
    const selectedReferenceUtxo = {
      txHash: "11".repeat(32),
      outputIndex: 0
    };
    const selfAddress = resolveWalletSpendAddress({
      sttPolicyId: getSttMintPolicyId(),
      sttAssetNameHex: deriveAssetName(selectedReferenceUtxo)
    });
    const state = withFallbackAdminUserInStateForm(
      createDefaultStateForm(),
      ADMIN_KEY_HASH
    );
    state.streamingPayments = [
      {
        id: "1",
        payoutAddress: selfAddress,
        paidOutAmount: "0",
        policyId: "",
        assetName: "",
        amountPerDay: "1000000",
        startDate: "1",
        endDate: "2"
      }
    ];
    const input = {
      stateDatum: stateFormToDatum(state),
      mintLovelace: "2000000",
      selectedReferenceUtxo
    } satisfies MintFormInput;

    await expect(buildMintStateTokenTx(wallet, input)).rejects.toThrow(
      /mint:validateStreamingPaymentDestinations.*cannot pay to this smart wallet/i
    );
    expect(chain.evaluations).toBe(0);
  });
});
