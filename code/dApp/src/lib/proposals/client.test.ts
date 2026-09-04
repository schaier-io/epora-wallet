import assert from "node:assert/strict";
import test from "node:test";

import { signOutProposals } from "./client";

test("sign-out rejects when the server does not clear the session", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Could not sign out. Try again." }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });

  try {
    await assert.rejects(signOutProposals(), {
      message: "Could not sign out. Try again."
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
