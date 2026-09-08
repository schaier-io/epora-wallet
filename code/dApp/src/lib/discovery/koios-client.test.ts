import assert from "node:assert/strict";
import test from "node:test";
import { fetchCredentialUtxos } from "./koios-client";
import { queryRetryDelay, retryQuery } from "@/lib/query/client";

test("credential discovery honors rate-limit delay and forwards cancellation", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.signal, controller.signal);
    return new Response("Limited", { status: 429, headers: { "Retry-After": "60" } });
  };
  try {
    await assert.rejects(() => fetchCredentialUtxos("aa".repeat(28), "preprod", controller.signal), error =>
      retryQuery(0, error) && queryRetryDelay(0, error) === 60_000);
  } finally { globalThis.fetch = original; }
});
