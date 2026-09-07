import assert from "node:assert/strict";
import test from "node:test";
import { toScriptRef } from "@meshsdk/core-cst";
import { resolveScriptHash, type UTxO } from "@meshsdk/core";
import { getSttSpendScript, resolveSttReferenceStoreAddress } from "@/lib/contracts/blueprint";
import type { TxFetcher } from "@/lib/mesh/tx-context";
import { discoverSharedSttReference } from "../../shared-stt-reference-discovery";

const HASH = "ab".repeat(32);
const script = getSttSpendScript();
const helper: UTxO = {
  input: { txHash: HASH, outputIndex: 2 },
  output: {
    address: resolveSttReferenceStoreAddress(),
    amount: [{ unit: "lovelace", quantity: "5000000" }],
    scriptRef: String(toScriptRef(script).toCbor()),
    scriptHash: resolveScriptHash(script.code, script.version)
  }
};

// Shared-helper invariant: discovery verifies bytes and liveness after strict raw pagination.
const metadata = { tx_hash: HASH, output_index: 2, reference_script_hash: helper.output.scriptHash };
for (const variant of ["valid", "spent", "unknown-status", "wrong-bytes"] as const) {
  test(`server discovery verifies ${variant}`, async () => {
    const candidate = variant === "wrong-bytes" ? { ...helper, output: { ...helper.output, scriptRef: "00" } } : helper;
    const fetcher = {
      fetchAddressUTxOs: async () => { throw new Error("SDK adapter must not run"); },
      fetchUTxOs: async () => [candidate],
      get: async (path: string) => path.startsWith("addresses/") ? [metadata] : variant === "unknown-status" ? {} : {
        outputs: [{ output_index: 2, consumed_by_tx: variant === "spent" ? "cd".repeat(32) : null }]
      }
    } as unknown as TxFetcher;
    const result = discoverSharedSttReference(fetcher, script);
    if (variant === "valid") assert.equal((await result).matchingReferences[0]?.reference, `${HASH}#2`);
    else await assert.rejects(result);
  });
}
test("SDK empty-array error adapter must not turn provider failure into missing", async () => {
  const fetcher = { fetchAddressUTxOs: async () => [], get: async () => { throw new Error("provider unavailable"); } } as unknown as TxFetcher;
  await assert.rejects(discoverSharedSttReference(fetcher, script), /provider unavailable/);
});
test("rejects malformed provider data instead of declaring the helper missing", async () => {
  const fetcher = { get: async () => ({error:"unavailable"}) } as unknown as TxFetcher;
  await assert.rejects(discoverSharedSttReference(fetcher, script));
});
test("paginates full pages and verifies the candidate on the next page", async () => {
  const calls: string[] = [];
  const fetcher = {
    fetchUTxOs: async () => [helper],
    get: async (path: string) => {
      calls.push(path);
      if (path.includes("page=1&")) return Array.from({length:100}, () => ({...metadata,reference_script_hash:null}));
      if (path.includes("page=2&")) return [metadata];
      return {outputs:[{output_index:2,consumed_by_tx:null}]};
    }
  } as unknown as TxFetcher;
  assert.equal((await discoverSharedSttReference(fetcher,script)).matchingReferences[0]?.reference, `${HASH}#2`);
  assert.equal(calls.filter(path => path.startsWith("addresses/")).length, 2);
});
test("reports missing only after a successful complete empty scan", async () => {
  const fetcher = {get:async()=>[]} as unknown as TxFetcher;
  assert.deepEqual((await discoverSharedSttReference(fetcher,script)).matchingReferences, []);
});
test("reports unavailable when the pagination cap prevents a complete scan", async () => {
  let calls = 0;
  const fetcher = {get:async()=>{ calls++; return Array.from({length:100},()=>({...metadata,reference_script_hash:null})); }} as unknown as TxFetcher;
  await assert.rejects(discoverSharedSttReference(fetcher,script), /SHARED_HELPER_UNAVAILABLE/);
  assert.equal(calls,10);
});
