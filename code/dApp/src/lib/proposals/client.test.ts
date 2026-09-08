import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchProposal,
  fetchProposalSession,
  listProposals,
  getProposalErrorMessage,
  ProposalRequestError,
  signOutProposals
} from "./client";

test("proposal errors preserve only server-owned response copy", () => {
  assert.equal(
    getProposalErrorMessage(new ProposalRequestError("The proposal changed. Reload it."), "Fallback."),
    "The proposal changed. Reload it."
  );
  assert.equal(
    getProposalErrorMessage(new Error("provider endpoint /api/v0/key failed"), "Fallback."),
    "Fallback."
  );
  assert.equal(
    getProposalErrorMessage(new Error("The provider connection failed."), "Fallback."),
    "Fallback."
  );
});

test("sign-out rejects when the server does not clear the session", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Could not sign out. Try again." }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });

  try {
    await assert.rejects(
      signOutProposals(),
      (error) =>
        error instanceof ProposalRequestError &&
        error.message === "Could not sign out. Try again."
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("proposal reads forward cancellation and retain HTTP error status", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  const signals: Array<AbortSignal | null | undefined> = [];
  globalThis.fetch = async (_input, init) => {
    signals.push(init?.signal);
    return new Response(JSON.stringify({ error: "Session expired." }), {
      status: 401, headers: { "content-type": "application/json" }
    });
  };
  try {
    assert.equal(await fetchProposalSession({ signal: controller.signal }), null);
    for (const read of [
      () => listProposals({}, { signal: controller.signal }),
      () => fetchProposal("proposal-1", { signal: controller.signal })
    ]) {
      await assert.rejects(read, (error) => error instanceof ProposalRequestError && error.status === 401);
    }
    assert.deepEqual(signals, [controller.signal, controller.signal, controller.signal]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("proposal reads preserve server retry delays", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "Slow down" }), {
    status: 429, headers: { "Retry-After": "60", "Content-Type": "application/json" }
  });
  try {
    for (const read of [() => listProposals(), () => fetchProposalSession()]) {
      await assert.rejects(read, error => error instanceof ProposalRequestError && error.retryAfterMs === 60_000);
    }
  } finally { globalThis.fetch = originalFetch; }
});
