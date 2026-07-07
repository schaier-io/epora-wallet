// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { BrowserWallet, UTxO } from "@meshsdk/core";
import type { ContractConfig, LockFundsFormInput } from "@/lib/types/contracts";

// Integration test: exercise the real builder + real MeshSDK transaction build,
// mocking only the chain I/O (ServerFetcher). lock-funds has no script inputs, so
// no collateral / cost-model fetch / evaluation is needed — the cleanest builder
// to prove the end-to-end build path. Lives in vitest (*.test.tsx) because it
// relies on vi.mock; pure-logic suites stay on node:test (*.test.ts).
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
      return [];
    }
    async fetchUTxOs() {
      return [];
    }
    async get() {
      return {};
    }
    async evaluateTx() {
      return [];
    }
    async submitTx() {
      return "00".repeat(32);
    }
  }
  return { ServerFetcher };
});

const { buildLockFundsTx } = await import("@/lib/mesh/transactions/lock-funds");
const { resolveWalletContinuingOutputAddress } = await import("@/lib/contracts/blueprint");

const POLICY = "ab".repeat(28); // 28-byte hex policy id (validator param)
const ASSET = "deadbeef";
// The lock target: the wallet's continuing (script) output address.
const lockAddress = resolveWalletContinuingOutputAddress({
  sttPolicyId: POLICY,
  sttAssetNameHex: ASSET,
  intendedStakeCredential: undefined
});
// The funding/change address must be a key-hash (enterprise) address — MeshSDK
// coin selection rejects script addresses. Derived from key hash "11"*28 via
// buildEnterpriseAddress(0, ...) so it's a real, checksum-valid preprod address.
const PAYMENT_ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";

const fundingUtxo = {
  input: { txHash: "11".repeat(32), outputIndex: 0 },
  output: { address: PAYMENT_ADDRESS, amount: [{ unit: "lovelace", quantity: "100000000" }] } // 100 ADA
} as unknown as UTxO;

const wallet = {
  getUtxos: async () => [fundingUtxo],
  getChangeAddress: async () => PAYMENT_ADDRESS,
  getUsedAddresses: async () => [PAYMENT_ADDRESS],
  getUnusedAddresses: async () => []
} as unknown as BrowserWallet;

const config = {
  walletPolicyId: POLICY,
  walletAssetNameHex: ASSET,
  sttAssetNameHex: ASSET
} as unknown as ContractConfig;

describe("buildLockFundsTx (integration: real MeshSDK build, mocked chain I/O)", () => {
  it("builds a balanced transaction that locks the assets at the wallet address", async () => {
    const input = {
      assets: [{ unit: "lovelace", quantity: "2000000" }]
    } as unknown as LockFundsFormInput;

    const result = await buildLockFundsTx(wallet, config, input);

    expect(result.txHex).toMatch(/^[0-9a-f]+$/i);
    expect(result.estimatedFeeLovelace).toBeDefined();
    expect(BigInt(result.estimatedFeeLovelace ?? "0")).toBeGreaterThan(0n);
    expect(result.preview.action).toBe("lock-funds");
    expect(result.preview.cbor).toBe(result.txHex);
    expect(result.preview.summary).toContain(lockAddress);
  });

  it("rejects an empty asset list before touching the chain", async () => {
    const input = { assets: [] } as unknown as LockFundsFormInput;
    await expect(buildLockFundsTx(wallet, config, input)).rejects.toThrow(/at least one asset/);
  });
});
