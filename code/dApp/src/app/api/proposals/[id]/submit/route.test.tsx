import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  bodyHash: "bb".repeat(32),
  assembleSignedTx: vi.fn().mockReturnValue("signed-tx-cbor"),
  claimProposalSubmission: vi.fn(),
  completeProposalSubmission: vi.fn(),
  releaseProposalSubmission: vi.fn().mockResolvedValue(undefined),
  submitTx: vi.fn()
}));
const BODY_HASH = mocks.bodyHash;

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/proposals/api-helpers", () => ({
  jsonError: (message: string, status: number) =>
    NextResponse.json({ error: message }, { status }),
  requireProposalParticipant: vi.fn().mockResolvedValue({
    access: {
      walletUnit: "unit",
      walletPolicyId: "aa".repeat(28),
      createdByKeyHash: "aa".repeat(28),
      status: "OPEN",
      txBodyHash: mocks.bodyHash
    }
  }),
  requireSession: vi.fn().mockResolvedValue({
    session: { paymentKeyHash: "aa".repeat(28), address: "addr_test1caller" }
  }),
  txBodyHashSchema: z.string().length(64).regex(/^[0-9a-f]+$/i)
}));
vi.mock("@/lib/proposals/assemble", () => ({ assembleSignedTx: mocks.assembleSignedTx }));
vi.mock("@/lib/mesh/blockfrost-server", () => ({
  getBlockfrostProvider: () => ({ submitTx: mocks.submitTx })
}));
vi.mock("@/lib/proposals/store", () => ({
  claimProposalSubmission: mocks.claimProposalSubmission,
  completeProposalSubmission: mocks.completeProposalSubmission,
  releaseProposalSubmission: mocks.releaseProposalSubmission
}));

import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/proposals/proposal-1/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedBodyHash: BODY_HASH })
  });
}

beforeEach(() => {
  mocks.claimProposalSubmission.mockReset().mockResolvedValue({
    ok: true,
    proposal: { id: "proposal-1", txBodyHash: BODY_HASH }
  });
  mocks.completeProposalSubmission.mockReset().mockResolvedValue({
    ok: true,
    proposal: { id: "proposal-1", status: "SUBMITTED", submittedTxHash: BODY_HASH }
  });
  mocks.releaseProposalSubmission.mockClear();
  mocks.submitTx.mockReset();
});

it("assembles and broadcasts on the server before recording submission", async () => {
  mocks.submitTx.mockResolvedValue(BODY_HASH);

  const response = await POST(request(), { params: Promise.resolve({ id: "proposal-1" }) });

  expect(response.status).toBe(200);
  expect(mocks.assembleSignedTx).toHaveBeenCalled();
  expect(mocks.submitTx).toHaveBeenCalledWith("signed-tx-cbor");
  expect(mocks.completeProposalSubmission).toHaveBeenCalledWith({
    proposalId: "proposal-1",
    expectedBodyHash: BODY_HASH
  });
});

it("keeps the claim when the provider accepted the tx under a different hash", async () => {
  // The chain may hold this transaction, so reopening the row would invite a
  // rebuild that executes the same transfer twice.
  mocks.submitTx.mockResolvedValue("cc".repeat(32));

  const response = await POST(request(), { params: Promise.resolve({ id: "proposal-1" }) });

  expect(response.status).toBe(500);
  expect(mocks.completeProposalSubmission).not.toHaveBeenCalled();
  expect(mocks.releaseProposalSubmission).not.toHaveBeenCalled();
});

it("reopens the proposal only when the provider refused the tx outright", async () => {
  // Mesh throws the HTTP failure as a JSON string; a 4xx never reached the chain.
  mocks.submitTx.mockRejectedValue(
    JSON.stringify({ status: 400, data: { message: "ledger rejected" } })
  );

  const response = await POST(request(), { params: Promise.resolve({ id: "proposal-1" }) });

  expect(response.status).toBe(500);
  expect(mocks.completeProposalSubmission).not.toHaveBeenCalled();
  expect(mocks.releaseProposalSubmission).toHaveBeenCalledWith({
    proposalId: "proposal-1",
    expectedBodyHash: BODY_HASH
  });
});

it("keeps the claim when the broadcast outcome is unknown", async () => {
  // A timeout after Blockfrost forwarded the tx would otherwise reopen a row whose
  // inputs are about to be spent, and the rebuild would move the funds twice.
  mocks.submitTx.mockRejectedValue(new Error("timeout of 30000ms exceeded"));

  const response = await POST(request(), { params: Promise.resolve({ id: "proposal-1" }) });

  expect(response.status).toBe(500);
  expect(mocks.completeProposalSubmission).not.toHaveBeenCalled();
  expect(mocks.releaseProposalSubmission).not.toHaveBeenCalled();
});

it("reopens the proposal when assembly fails before any broadcast", async () => {
  // No request was made, so nothing can be on the chain; keeping the claim here
  // would lock the row in SUBMITTING with no way to retry.
  mocks.assembleSignedTx.mockImplementationOnce(() => {
    throw new Error("witness invalid");
  });

  const response = await POST(request(), { params: Promise.resolve({ id: "proposal-1" }) });

  expect(response.status).toBe(500);
  expect(mocks.submitTx).not.toHaveBeenCalled();
  expect(mocks.releaseProposalSubmission).toHaveBeenCalledWith({
    proposalId: "proposal-1",
    expectedBodyHash: BODY_HASH
  });
});
