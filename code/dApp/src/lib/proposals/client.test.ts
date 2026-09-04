import assert from "node:assert/strict";
import test from "node:test";

import {
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
