import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";

// The routes and readBoundedJson run their actual implementations.
// Authentication and provider work are outside this request-body regression.
vi.mock("@/lib/proposals/api-helpers", () => ({
  buildContextSchema: z.object({ builder: z.string() }).passthrough(),
  unsignedTxHexSchema: z.string(),
  witnessSetHexSchema: z.string(),
  txBodyHashSchema: z.string(),
  jsonError: (message: string, status: number) => NextResponse.json({ error: message }, { status }),
  requireSession: async () => ({ session: { paymentKeyHash: "aa".repeat(28) } }),
  requireProposalParticipant: async () => ({ access: {} })
}));
vi.mock("@/lib/http/rate-limit", () => ({
  clientKey: () => "test-caller",
  rateLimit: async () => ({ ok: true, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/proposals/store", () => ({
  ProposalQuotaExceededError: class ProposalQuotaExceededError extends Error {}
}));
vi.mock("@/lib/stt-cache/indexer", () => ({}));
vi.mock("@/lib/proposals/transaction-binding", () => ({}));
vi.mock("@/lib/proposals/verify", () => ({}));
vi.mock("@/lib/proposals/serialization", () => ({
  InvalidProposalTransactionError: class InvalidProposalTransactionError extends Error {}
}));
vi.mock("@/lib/proposals/witness-validation", () => ({
  InvalidProposalWitnessError: class InvalidProposalWitnessError extends Error {}
}));
vi.mock("@/lib/proposals/assemble", () => ({}));
vi.mock("@/lib/mesh/transactions/internals/budget", () => ({}));
vi.mock("@/lib/mesh/blockfrost-server", () => ({}));
vi.mock("@meshsdk/core", () => ({}));
vi.mock("@/lib/proposals/auth", () => ({}));
vi.mock("@/lib/proposals/auth-store", () => ({}));
vi.mock("@/lib/proposals/cose-key", () => ({}));
vi.mock("@/lib/proposals/signer-registration-store", () => ({}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn() },
  serializeError: (error: unknown) => error
}));

import { POST as createProposal } from "./route";
import { POST as signIn } from "./auth/route";
import { POST as issueNonce } from "./auth/nonce/route";
import { POST as signProposal } from "./[id]/sign/route";
import { PATCH as rebuildProposal } from "./[id]/rebuild/route";
import { POST as submitProposal } from "./[id]/submit/route";
import { InvalidJsonError, readBoundedJson, RequestBodyTooDeepError } from "@/lib/http/request-body";

const malformedBody = "{";
const deepBody = `${"[".repeat(65)}0${"]".repeat(65)}`;
const routes = [
  { path: "/api/proposals", method: "POST", handle: createProposal },
  { path: "/api/proposals/auth", method: "POST", handle: signIn },
  { path: "/api/proposals/auth/nonce", method: "POST", handle: issueNonce },
  { path: "/api/proposals/proposal-1/sign", method: "POST", handle: signProposal },
  { path: "/api/proposals/proposal-1/rebuild", method: "PATCH", handle: rebuildProposal },
  { path: "/api/proposals/proposal-1/submit", method: "POST", handle: submitProposal }
];
const cases = [
  { name: "malformed JSON", body: malformedBody, error: new InvalidJsonError() },
  { name: "deep JSON", body: deepBody, error: new RequestBodyTooDeepError(64) }
];

function request(path: string, method: string, body: string) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body
  });
}

// A schema rejection must not hide this regression. Check the parser classes too.
it.each(cases)("the real parser rejects $name with its typed error", async ({ body, error }) => {
  await expect(readBoundedJson(request("/api/proposals", "POST", body)))
    .rejects.toBeInstanceOf(error.constructor);
});

for (const route of routes) {
  describe(`${route.method} ${route.path}`, () => {
    it.each(cases)("returns HTTP 400 for $name", async ({ body, error }) => {
      const response = await route.handle(request(route.path, route.method, body), {
        params: Promise.resolve({ id: "proposal-1" })
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: error.message });
    });
  });
}
