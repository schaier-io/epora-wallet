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

function request(body?: unknown) {
  return new Request("http://localhost/api/proposals/proposal-1", {
    method: "DELETE",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        })
  });
}

beforeEach(() => {
  mocks.disposeProposalRecord.mockReset().mockResolvedValue({ ok: true });
});

it("withdraws on behalf of the session's wallet when no intent is sent", async () => {
  const response = await DELETE(request(), { params: Promise.resolve({ id: "proposal-1" }) });

  expect(response.status).toBe(200);
  // The actor comes from the signed session, never from the request, so a
  // co-signer cannot remove somebody else's request by crafting a call.
  expect(mocks.disposeProposalRecord).toHaveBeenCalledWith({
    proposalId: "proposal-1",
    actorKeyHash: CALLER,
    intent: "cancel"
  });
});

it("keeps the cancel intent when the body is not the shape it expects", async () => {
  for (const malformed of ["not json", { intent: "something-else" }, { intent: 42 }]) {
    mocks.disposeProposalRecord.mockClear();
    const raw = malformed === "not json"
      ? new Request("http://localhost/api/proposals/proposal-1", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: "not json"
        })
      : request(malformed);
    const response = await DELETE(raw, { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.disposeProposalRecord).toHaveBeenCalledWith({
      proposalId: "proposal-1",
      actorKeyHash: CALLER,
      intent: "cancel"
    });
  }
});

it("deletes only when the request carries the explicit delete intent", async () => {
  const response = await DELETE(request({ intent: "delete" }), {
    params: Promise.resolve({ id: "proposal-1" })
  });

  expect(response.status).toBe(200);
  expect(mocks.disposeProposalRecord).toHaveBeenCalledWith({
    proposalId: "proposal-1",
    actorKeyHash: CALLER,
    intent: "delete"
  });
});

it("answers with the guard's error so the client keeps the item visible", async () => {
  mocks.disposeProposalRecord.mockResolvedValue({
    ok: false,
    status: 409,
    error: "Proposal is open."
  });

  const response = await DELETE(request({ intent: "delete" }), {
    params: Promise.resolve({ id: "proposal-1" })
  });

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Proposal is open." });
});
