import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";

const store = vi.hoisted(() => ({
  replaceProposalBuild: vi.fn()
}));

const transactionBinding = vi.hoisted(() => ({
  assertProposalTransactionBinding: vi.fn<
    (input: { unsignedTxHex: string; buildContext: { builder: string; mode?: string } }) => void
  >()
}));

vi.mock("@/lib/proposals/store", () => store);
vi.mock("@/lib/proposals/transaction-binding", () => transactionBinding);
vi.mock("@/lib/http/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/proposals/api-helpers", () => ({
  buildContextSchema: z.object({ builder: z.string() }).passthrough(),
  jsonError: (message: string, status: number) =>
    NextResponse.json({ error: message }, { status }),
  reconcileBodyHash: (_txHex: string, claimed: string) => claimed,
  requireProposalParticipant: vi.fn().mockResolvedValue({
    access: {
      walletUnit: `${"bb".repeat(28)}01`,
      walletPolicyId: "bb".repeat(28),
      authorityPath: "multisig",
      builder: "stt-spend",
      actionKind: "use",
      createdByKeyHash: "aa".repeat(28),
      status: "OPEN",
      txBodyHash: "dd".repeat(32)
    }
  }),
  requireSession: vi.fn().mockResolvedValue({
    session: { paymentKeyHash: "aa".repeat(28), address: "addr_test1caller" }
  }),
  txBodyHashSchema: z.string().length(64).regex(/^[0-9a-f]+$/i),
  unsignedTxHexSchema: z.string().regex(/^[0-9a-f]+$/i)
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key)
}));

import { PATCH } from "./route";
import { InvalidProposalBuildContextError } from "@/lib/proposals/validation";

function request() {
  return new Request("http://localhost/api/proposals/proposal-1/rebuild", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      unsignedTxHex: "80",
      txBodyHash: "ee".repeat(32),
      expectedBodyHash: "dd".repeat(32),
      buildContext: {
        builder: "stt-spend",
        mode: "use",
        config: {
          sttAssetNameHex: "01",
          walletPolicyId: "bb".repeat(28),
          walletAssetNameHex: "01"
        },
        input: {
          sttInputTxHash: "cc".repeat(32),
          sttInputOutputIndex: 0,
          authorityPath: "multisig"
        }
      }
    })
  });
}

describe("PATCH /api/proposals/:id/rebuild", () => {
  beforeEach(() => {
    store.replaceProposalBuild.mockReset();
    transactionBinding.assertProposalTransactionBinding.mockReset();
  });

  it("rejects rebuilt bytes that disagree with the accepted build context", async () => {
    transactionBinding.assertProposalTransactionBinding.mockImplementationOnce(() => {
      throw new InvalidProposalBuildContextError("Transaction redeemer mismatch.");
    });

    const response = await PATCH(request(), { params: Promise.resolve({ id: "proposal-1" }) });

    expect(response.status).toBe(400);
    expect(transactionBinding.assertProposalTransactionBinding).toHaveBeenCalledTimes(1);
    const bindingInput = transactionBinding.assertProposalTransactionBinding.mock.calls[0]![0];
    expect(bindingInput.unsignedTxHex).toBe("80");
    expect(bindingInput.buildContext).toMatchObject({ builder: "stt-spend", mode: "use" });
    expect(store.replaceProposalBuild).not.toHaveBeenCalled();
  });

  it("rejects a rebuild that changes the stored action", async () => {
    const payload = await request().json();
    payload.buildContext.mode = "update-state";
    const response = await PATCH(
      new Request("http://localhost/api/proposals/proposal-1/rebuild", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }),
      { params: Promise.resolve({ id: "proposal-1" }) }
    );

    expect(response.status).toBe(400);
    expect(transactionBinding.assertProposalTransactionBinding).not.toHaveBeenCalled();
    expect(store.replaceProposalBuild).not.toHaveBeenCalled();
  });
});
