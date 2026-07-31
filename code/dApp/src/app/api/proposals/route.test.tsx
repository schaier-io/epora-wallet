import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";

const store = vi.hoisted(() => ({
  createProposalRecord: vi.fn(),
  isWalletParticipant: vi.fn(),
  listProposalRecordsForParticipant: vi.fn(),
  ProposalQuotaExceededError: class ProposalQuotaExceededError extends Error {}
}));

vi.mock("@/lib/proposals/store", () => store);
vi.mock("@/lib/http/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/proposals/api-helpers", () => ({
  buildContextSchema: z.object({ builder: z.string() }).passthrough(),
  hexSchema: z.string().regex(/^[0-9a-f]+$/i),
  unsignedTxHexSchema: z.string().regex(/^[0-9a-f]+$/i),
  jsonError: (message: string, status: number) =>
    NextResponse.json({ error: message }, { status }),
  reconcileBodyHash: (_txHex: string, claimed: string) => claimed,
  requireSession: vi.fn().mockResolvedValue({
    session: { paymentKeyHash: "aa".repeat(28), address: "addr_test1caller" }
  }),
  txBodyHashSchema: z.string().length(64).regex(/^[0-9a-f]+$/i)
}));

import { GET, POST } from "./route";

const CALLER = "aa".repeat(28);
const POLICY = "bb".repeat(28);
const ASSET_NAME = "01";

function createRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/proposals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletUnit: `${POLICY}${ASSET_NAME}`,
      walletPolicyId: POLICY,
      title: "Spend",
      actionKind: "use",
      authorityPath: "multisig",
      builder: "stt-spend",
      buildContext: {
        builder: "stt-spend",
        mode: "use",
        config: {
          sttAssetNameHex: ASSET_NAME,
          walletPolicyId: POLICY,
          walletAssetNameHex: ASSET_NAME
        },
        input: { sttInputTxHash: "cc".repeat(32), sttInputOutputIndex: 0 }
      },
      unsignedTxHex: "80",
      txBodyHash: "dd".repeat(32),
      ...overrides
    })
  });
}

describe("POST /api/proposals", () => {
  beforeEach(() => {
    store.createProposalRecord.mockReset();
    store.isWalletParticipant.mockReset();
    store.listProposalRecordsForParticipant.mockReset();
  });

  it("returns a bounded page and forwards the cursor", async () => {
    store.listProposalRecordsForParticipant.mockResolvedValue({
      proposals: [{ id: "proposal-2" }],
      nextCursor: "proposal-2"
    });

    const response = await GET(
      new Request("http://localhost/api/proposals?limit=10&cursor=proposal-1")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      proposals: [{ id: "proposal-2" }],
      nextCursor: "proposal-2"
    });
    expect(store.listProposalRecordsForParticipant).toHaveBeenCalledWith(CALLER, undefined, {
      limit: 10,
      cursor: "proposal-1"
    });
  });

  it("rejects an oversized proposal page", async () => {
    const response = await GET(new Request("http://localhost/api/proposals?limit=51"));
    expect(response.status).toBe(400);
    expect(store.listProposalRecordsForParticipant).not.toHaveBeenCalled();
  });

  it("rejects an authenticated caller who is not a wallet participant", async () => {
    store.isWalletParticipant.mockResolvedValue(false);

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "You are not a participant of this wallet." });
    expect(store.isWalletParticipant).toHaveBeenCalledWith(`${POLICY}${ASSET_NAME}`, CALLER);
    expect(store.createProposalRecord).not.toHaveBeenCalled();
  });

  it("rejects a claimed wallet unit that disagrees with the build context", async () => {
    store.isWalletParticipant.mockResolvedValue(true);

    const response = await POST(createRequest({ walletUnit: `${POLICY}02` }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Proposal wallet identity does not match its build context."
    });
    expect(store.createProposalRecord).not.toHaveBeenCalled();
  });
});
