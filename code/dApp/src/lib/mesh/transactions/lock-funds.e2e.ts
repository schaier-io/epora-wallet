import { describe, expect, it, vi } from "vitest";

// TRUE end-to-end test: build -> sign -> submit a real lock-funds transaction on
// preprod, using a real funded wallet and real Blockfrost. Unlike the *.test.tsx
// integration tests (which stub chain I/O), this runs the actual chain code and
// the node accepts the tx only if it is genuinely valid.
//
// lock-funds has NO Plutus scripts, so a successful submitTx means the node fully
// validated it (phase-1) — submission acceptance is the assertion. Each run locks
// a small amount of tADA at a script address derived from the (test) config, so
// use a DEDICATED, faucet-funded preprod wallet.
//
// Run:  BLOCKFROST_PREPROD_PROJECT_ID=preprod... E2E_PREPROD_MNEMONIC="word word ..." pnpm test:e2e
// Skips automatically when those env vars are unset.
const MNEMONIC = process.env.E2E_PREPROD_MNEMONIC?.trim();
const BLOCKFROST = process.env.BLOCKFROST_PREPROD_PROJECT_ID?.trim();
const E2E_ENABLED = Boolean(MNEMONIC && BLOCKFROST);

// Shortcut the client ServerFetcher (which POSTs /api/mesh) directly to the real
// server-side Blockfrost path, so no Next.js dev server is needed. Only the chain
// transport is bypassed — every chain call still hits real Blockfrost. The factory
// (and getBlockfrostProvider) only runs once the mocked module is imported, which
// happens inside the test body — so a skipped run never touches Blockfrost.
vi.mock("@/lib/mesh/server-fetcher", async () => {
  const { getBlockfrostProvider, executeMeshMethod } = await import("@/lib/mesh/blockfrost-server");
  class ServerFetcher {
    private readonly provider = getBlockfrostProvider();
    fetchProtocolParameters(epoch?: number) {
      return executeMeshMethod(this.provider, "fetchProtocolParameters", [epoch]);
    }
    fetchCostModels(epoch?: number) {
      return executeMeshMethod(this.provider, "fetchCostModels", [epoch]);
    }
    fetchAddressUTxOs(address: string, asset?: string) {
      return executeMeshMethod(this.provider, "fetchAddressUTxOs", [address, asset]);
    }
    fetchUTxOs(hash: string, index?: number) {
      return executeMeshMethod(this.provider, "fetchUTxOs", [hash, index]);
    }
    get(url: string) {
      return executeMeshMethod(this.provider, "get", [url]);
    }
    evaluateTx(tx: string, additionalUtxos?: unknown, additionalTxs?: unknown) {
      return executeMeshMethod(this.provider, "evaluateTx", [tx, additionalUtxos, additionalTxs]);
    }
    submitTx(tx: string) {
      return executeMeshMethod(this.provider, "submitTx", [tx]);
    }
  }
  return { ServerFetcher };
});

const describeOrSkip = E2E_ENABLED ? describe : describe.skip;

describeOrSkip("E2E: buildLockFundsTx on preprod (real wallet + Blockfrost)", () => {
  it("builds, signs, and submits a lock-funds tx the node accepts", async () => {
    const [{ buildLockFundsTx }, { signAndSubmitTx }, { MeshWallet }, { getBlockfrostProvider }] =
      await Promise.all([
        import("@/lib/mesh/transactions/lock-funds"),
        import("@/lib/mesh/transactions/submit"),
        import("@meshsdk/core"),
        import("@/lib/mesh/blockfrost-server")
      ]);

    const provider = getBlockfrostProvider();
    const wallet = new MeshWallet({
      networkId: 0,
      fetcher: provider,
      submitter: provider,
      key: { type: "mnemonic", words: MNEMONIC!.split(/\s+/) }
    });
    await wallet.init();

    // A throwaway script address (derived from a test policy/asset) is the lock
    // target. The funding + change come from the real wallet's real UTxOs.
    const config = {
      walletPolicyId: "ab".repeat(28),
      walletAssetNameHex: "deadbeef",
      sttAssetNameHex: "deadbeef"
    } as unknown as Parameters<typeof buildLockFundsTx>[1];
    const input = {
      assets: [{ unit: "lovelace", quantity: "2000000" }]
    } as unknown as Parameters<typeof buildLockFundsTx>[2];

    const built = await buildLockFundsTx(
      wallet as unknown as Parameters<typeof buildLockFundsTx>[0],
      config,
      input
    );
    expect(built.txHex).toMatch(/^[0-9a-f]+$/i);

    const txHash = await signAndSubmitTx(
      wallet as unknown as Parameters<typeof signAndSubmitTx>[0],
      built.txHex
    );
    // A returned tx hash means the preprod node accepted the submitted transaction.
    expect(txHash).toMatch(/^[0-9a-f]{64}$/i);
  });
});
