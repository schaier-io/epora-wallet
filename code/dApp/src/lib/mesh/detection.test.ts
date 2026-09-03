import assert from "node:assert/strict";
import test from "node:test";
import { detectSttInfo } from "./detection";
import { getSttMintPolicyId } from "@/lib/contracts/blueprint";

type MeshCall = { method: string; args: unknown[] };

function stubMeshRpc(handler: (call: MeshCall) => unknown) {
  const calls: MeshCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body)) as MeshCall;
    calls.push(call);
    return new Response(JSON.stringify({ result: handler(call) }), { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

function scriptUtxo(unit: string, index: number) {
  return {
    input: { txHash: "a".repeat(64), outputIndex: index },
    output: { address: "addr_test1script", amount: [{ unit: "lovelace", quantity: "2000000" }, { unit, quantity: "1" }] }
  };
}

/**
 * The regression: detection fetched the script address once PER wallet asset, in series. With
 * the shared reference-store check, the per-wallet balance summaries and the activity feed all
 * firing on the same page load, a policy with a handful of wallets tripped the /api/mesh rate
 * limit, and the failed detection left the deep-linked wallet showing as "not one of yours".
 */
test("detectSttInfo fetches the script address once for every wallet, not once per wallet", async () => {
  const policyId = getSttMintPolicyId();
  const units = ["01", "02", "03"].map((name) => `${policyId}${name}`);
  const stub = stubMeshRpc(({ method }) => {
    if (method === "fetchCollectionAssets") {
      return { assets: units.map((unit) => ({ unit, quantity: "1" })), next: null };
    }
    if (method === "fetchAddressUTxOs") {
      return units.map((unit, index) => scriptUtxo(unit, index));
    }
    throw new Error(`unexpected mesh method ${method}`);
  });

  try {
    const detected = await detectSttInfo();

    assert.deepEqual(
      detected.tokens.map((token) => token.unit),
      units
    );
    const utxoCalls = stub.calls.filter((call) => call.method === "fetchAddressUTxOs");
    assert.equal(utxoCalls.length, 1);
    assert.equal(stub.calls.length, 2);
  } finally {
    stub.restore();
  }
});

test("detectSttInfo skips the address lookup when the policy has no assets", async () => {
  const stub = stubMeshRpc(({ method }) => {
    if (method === "fetchCollectionAssets") {
      return { assets: [], next: null };
    }
    throw new Error(`unexpected mesh method ${method}`);
  });

  try {
    const detected = await detectSttInfo();

    assert.deepEqual(detected.tokens, []);
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});
