import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  disposeProposalRecord: vi.fn(),
  getProposalRecord: vi.fn()
}));

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/proposals/api-helpers", () => ({
  jsonError: (message: string, status: number) =>
    NextResponse.json({ error: message }, { status }),
  requireProposalParticipant: vi.fn(),
  requireSession: vi.fn().mockResolvedValue({
    session: { paymentKeyHash: "aa".repeat(28), address: "addr_test1caller" }
  })
}));
vi.mock("@/lib/proposals/store", () => ({
  disposeProposalRecord: mocks.disposeProposalRecord,
  getProposalRecord: mocks.getProposalRecord
}));

import { DELETE } from "./route";

const CALLER = "aa".repeat(28);

function request() {
  return new Request("http://localhost/api/proposals/proposal-1", { method: "DELETE" });
}

beforeEach(() => {
  mocks.disposeProposalRecord.mockReset().mockResolvedValue({ ok: true });
});

it("removes a request on behalf of the session's wallet only", async () => {
  const response = await DELETE(request(), { params: Promise.resolve({ id: "proposal-1" }) });

  expect(response.status).toBe(200);
  // The actor comes from the signed session, never from the request, so a
  // co-signer cannot delete somebody else's request by crafting a call.
  expect(mocks.disposeProposalRecord).toHaveBeenCalledWith({
    proposalId: "proposal-1",
    actorKeyHash: CALLER
  });
});

it("answers with the guard's error so the client keeps the item visible", async () => {
  mocks.disposeProposalRecord.mockResolvedValue({
    ok: false,
    status: 409,
    error: "Proposal is open."
  });

  const response = await DELETE(request(), { params: Promise.resolve({ id: "proposal-1" }) });

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Proposal is open." });
});
