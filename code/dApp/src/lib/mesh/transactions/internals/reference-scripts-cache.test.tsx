// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type * as MeshSdk from "@meshsdk/core";
import type { TxFetcher } from "@/lib/mesh/tx-context";

vi.mock("@meshsdk/core", async importOriginal => {
  const sdk = await importOriginal<typeof MeshSdk>();
  return { ...sdk, resolveScriptHash: vi.fn(sdk.resolveScriptHash) };
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

it("shares blueprint hashes while checking each reference's current contents and spend status", async () => {
  const { getSttSpendScript, getSttMintPolicyId, getSttMintScript, getWalletSpendScript } = await import("@/lib/contracts/blueprint");
  const { resolveReferenceScript } = await import("./reference-scripts");
  const { resolveScriptHash } = await import("@meshsdk/core");
  const { toScriptRef } = await import("@meshsdk/core-cst");
  const script = getSttSpendScript();
  const hash = getSttMintPolicyId();
  expect(getSttMintScript()).toEqual(script);
  const txHash = "a".repeat(64);
  const reference = {
    input: { txHash, outputIndex: 0 },
    output: {
      address: "addr_test1qexample",
      amount: [{ unit: "lovelace", quantity: "1000000" }],
      scriptRef: String(toScriptRef(script).toCbor()),
      scriptHash: hash
    }
  };
  const fetchUTxOs = vi.fn(async () => [reference]);
  const get = vi.fn(async () => ({ outputs: [{ output_index: 0, consumed_by_tx: null as string | null }] }));
  const fetcher = { fetchUTxOs, get } as unknown as TxFetcher;
  const options = { label: "STT", configuredReference: `${txHash}#0`, script, stage: "test:reference" };

  expect((await resolveReferenceScript(fetcher, options))?.validation).toBe("hash-verified");
  expect((await resolveReferenceScript(fetcher, options))?.scriptHash).toBe(hash);
  expect(resolveScriptHash).toHaveBeenCalledTimes(1);
  expect(fetchUTxOs).toHaveBeenCalledTimes(2);
  expect(get).toHaveBeenCalledTimes(2);

  reference.output.scriptRef = String(toScriptRef({ ...script, version: "V2" }).toCbor());
  await expect(resolveReferenceScript(fetcher, options)).rejects.toThrow("STT reference script UTxO");
  reference.output.scriptRef = String(toScriptRef(getWalletSpendScript({
    sttPolicyId: hash, sttAssetNameHex: "00"
  })).toCbor());
  await expect(resolveReferenceScript(fetcher, options)).rejects.toThrow("STT reference script UTxO");
  expect(resolveScriptHash).toHaveBeenCalledTimes(2);
  reference.output.scriptRef = "00";
  await expect(resolveReferenceScript(fetcher, options)).rejects.toThrow("STT reference script UTxO");
  reference.output.scriptRef = String(toScriptRef(script).toCbor());
  get.mockResolvedValueOnce({ outputs: [{ output_index: 0, consumed_by_tx: "b".repeat(64) }] });
  await expect(resolveReferenceScript(fetcher, options)).rejects.toThrow("was already spent");
  expect(get).toHaveBeenCalledTimes(6);
});
