import assert from "node:assert/strict";
import test from "node:test";
import { detectSharedSttReferenceStore, detectSttInfo } from "./detection";
import { getSttMintPolicyId, getSttSpendScript, resolveScriptAddress } from "@/lib/contracts/blueprint";
import { MeshRpcError } from "./server-fetcher";
import { queryRetryDelay, retryQuery } from "@/lib/query/client";

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
    output: { address: resolveScriptAddress(getSttSpendScript()), amount: [{ unit: "lovelace", quantity: "2000000" }, { unit, quantity: "1" }] }
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


test("known wallet detection uses the asset index and skips broad discovery", async () => {
  const unit = `${getSttMintPolicyId()}01`;
  const stub = stubMeshRpc(({ method, args }) => {
    assert.equal(method, "fetchAddressUTxOs");
    assert.deepEqual(args, [resolveScriptAddress(getSttSpendScript()), unit]);
    return [scriptUtxo(unit, 0), scriptUtxo(`${getSttMintPolicyId()}02`, 1)];
  });
  try {
    const detected = await detectSttInfo(unit);
    assert.deepEqual(detected.tokens.map((token) => token.unit), [unit]);
    assert.equal(stub.calls.length, 1);
  } finally { stub.restore(); }
});

test("known wallet lookup rejects a foreign policy without querying the chain", async () => {
  const stub = stubMeshRpc(() => assert.fail("No chain query expected"));
  try {
    await assert.rejects(detectSttInfo(`${"ff".repeat(28)}01`), /current STT policy/);
    assert.equal(stub.calls.length, 0);
  } finally { stub.restore(); }
});

test("shared helper detection reads the server result without browser discovery", async () => {
  const originalFetch = globalThis.fetch;
  const result = {
    status: "ready", activeReference: `${"ab".repeat(32)}#0`,
    policyId: getSttMintPolicyId(), sttScriptHash: getSttMintPolicyId(), storeAddress: "addr_test1store",
    matchingReferences: [`${"ab".repeat(32)}#0`], matchingCount: 1, checkedReferenceCount: 1
  };
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    assert.equal(url, "/api/shared-helper");
    assert.notEqual(init?.method, "POST");
    return new Response(JSON.stringify({ result }), { status: 200 });
  }) as typeof fetch;
  try {
    assert.deepEqual(await detectSharedSttReferenceStore(), result);
  } finally { globalThis.fetch = originalFetch; }
});

test("shared helper detection reports server failure instead of creating a helper", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "SHARED_HELPER_UNAVAILABLE" }), { status: 503 })) as typeof fetch;
  try {
    await assert.rejects(detectSharedSttReferenceStore(), /Wallet service is temporarily unavailable/);
  } finally { globalThis.fetch = originalFetch; }
});

test("shared helper rate limits retain the server retry delay", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 429, headers: { "Retry-After": "60" } });
  try {
    await assert.rejects(detectSharedSttReferenceStore(), (error: unknown) => {
      assert.ok(error instanceof MeshRpcError);
      assert.equal(error.message, "Wallet service is temporarily unavailable.");
      assert.equal(error.status, 429);
      assert.equal(queryRetryDelay(0, error), 60_000);
      assert.equal(retryQuery(0, error), true);
      return true;
    });
  } finally { globalThis.fetch = originalFetch; }
});

test("shared helper authorization failures do not trigger Query retries", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 401 });
  try {
    await assert.rejects(detectSharedSttReferenceStore(), (error: unknown) => {
      assert.ok(error instanceof MeshRpcError);
      assert.equal(error.status, 401);
      assert.equal(retryQuery(0, error), false);
      return true;
    });
  } finally { globalThis.fetch = originalFetch; }
});
