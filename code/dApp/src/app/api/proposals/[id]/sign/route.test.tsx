import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";

const store = vi.hoisted(() => ({
  getProposalRecord: vi.fn().mockResolvedValue({ id: "proposal-1" }),
  upsertProposalSignature: vi.fn().mockResolvedValue({ ok: true })
}));
const api = vi.hoisted(() => ({ requireProposalParticipant: vi.fn() }));

vi.mock("@/lib/proposals/store", () => store);
vi.mock("@/lib/proposals/api-helpers", () => ({
  hexSchema: z.string().regex(/^[0-9a-f]+$/i),
  jsonError: (message: string, status: number) =>
    NextResponse.json({ error: message }, { status }),
  requireSession: vi.fn().mockResolvedValue({
    session: { paymentKeyHash: "aa".repeat(28), address: "addr_test1caller" }
  }),
  requireProposalParticipant: api.requireProposalParticipant,
  txBodyHashSchema: z.string().length(64).regex(/^[0-9a-f]+$/i)
}));

import { POST } from "./route";

beforeEach(() => {
  store.upsertProposalSignature.mockClear();
  api.requireProposalParticipant.mockReset().mockResolvedValue({
    access: { txBodyHash: "bb".repeat(32) }
  });
});

it("rejects a signer who is not a wallet participant", async () => {
  api.requireProposalParticipant.mockResolvedValue({
    response: NextResponse.json({ error: "Not a participant." }, { status: 403 })
  });
  const request = new Request("http://localhost/api/proposals/proposal-1/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ witnessSetHex: "00", txBodyHash: "bb".repeat(32) })
  });

  const response = await POST(request, { params: Promise.resolve({ id: "proposal-1" }) });

  expect(response.status).toBe(403);
  expect(store.upsertProposalSignature).not.toHaveBeenCalled();
});

it("rejects malformed or unverifiable witness CBOR before storage", async () => {
  const request = new Request("http://localhost/api/proposals/proposal-1/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ witnessSetHex: "00", txBodyHash: "bb".repeat(32) })
  });

  const response = await POST(request, { params: Promise.resolve({ id: "proposal-1" }) });

  expect(response.status).toBe(400);
  expect(store.upsertProposalSignature).not.toHaveBeenCalled();
});
