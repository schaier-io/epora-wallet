import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";

const store = vi.hoisted(() => ({
  createProposalRecord: vi.fn(),
  isWalletIndexed: vi.fn(),
  isWalletParticipant: vi.fn(),
  listProposalRecordsForParticipant: vi.fn(),
  ProposalQuotaExceededError: class ProposalQuotaExceededError extends Error {}
}));

const indexer = vi.hoisted(() => ({
  reconcileWalletUnit: vi.fn()
}));

const transactionBinding = vi.hoisted(() => ({
  assertProposalTransactionBinding: vi.fn<
    (input: { unsignedTxHex: string; buildContext: { builder: string; mode?: string } }) => void
  >()
}));

vi.mock("@/lib/proposals/store", () => store);
vi.mock("@/lib/stt-cache/indexer", () => indexer);
vi.mock("@/lib/proposals/transaction-binding", () => transactionBinding);
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
import { InvalidProposalBuildContextError } from "@/lib/proposals/validation";

const CALLER = "aa".repeat(28);
const POLICY = "bb".repeat(28);
const ASSET_NAME = "01";

const SUPPORTED_BUILDERS = [
  "stt-spend",
  "wallet-withdraw",
  "wallet-publish",
  "wallet-vote",
  "set-intended-stake-credential",
  "consolidate-utxo"
] as const;

const UNSUPPORTED_BUILDERS = ["wallet-spend", "lock-funds", "mint"] as const;

const CREATABLE_STT_SPEND_MODES = [
  "use",
  "update-state",
  "manage-streaming-payments",
  "remove-access-index"
] as const;

const DIRECT_ONLY_STT_SPEND_MODES = [
  "renew-proof-of-life",
  "use-allowance",
  "use-beneficiary",
  "payout-streaming-payment",
  "cancel-streaming-payment"
] as const;

function buildContext(
  builder: (typeof SUPPORTED_BUILDERS)[number],
  mode = "use",
  authorityPath: "admin" | "multisig" = "multisig"
) {
  const config = {
    sttAssetNameHex: ASSET_NAME,
    walletPolicyId: POLICY,
    walletAssetNameHex: ASSET_NAME
  };
  if (builder === "stt-spend") {
    return {
      builder,
      mode,
      config,
      input: { sttInputTxHash: "cc".repeat(32), sttInputOutputIndex: 0, authorityPath }
    };
  }
  return {
    builder,
    config,
    input: { sttInputTxHash: "cc".repeat(32), sttInputOutputIndex: 0, authorityPath }
  };
}

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
        input: {
          sttInputTxHash: "cc".repeat(32),
          sttInputOutputIndex: 0,
          authorityPath: "multisig"
        }
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
    indexer.reconcileWalletUnit.mockReset();
    transactionBinding.assertProposalTransactionBinding.mockReset();
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
    // The wallet IS indexed, so the absent participant row really does mean "not a member".
    store.isWalletIndexed.mockResolvedValue(true);

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "You are not a participant of this wallet." });
    expect(store.isWalletParticipant).toHaveBeenCalledWith(`${POLICY}${ASSET_NAME}`, CALLER);
    // Already indexed: no reconcile is needed to know this answer.
    expect(indexer.reconcileWalletUnit).not.toHaveBeenCalled();
    expect(store.createProposalRecord).not.toHaveBeenCalled();
  });

  it("says the wallet is not indexed yet when reconciling finds nothing on chain", async () => {
    store.isWalletParticipant.mockResolvedValue(false);
    store.isWalletIndexed.mockResolvedValue(false);
    indexer.reconcileWalletUnit.mockResolvedValue(false);

    const response = await POST(createRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error:
        "This wallet has not been indexed yet. Wait for the network to confirm it, then try again."
    });
    expect(indexer.reconcileWalletUnit).toHaveBeenCalledWith(`${POLICY}${ASSET_NAME}`);
    expect(store.createProposalRecord).not.toHaveBeenCalled();
  });

  it("reconciles a freshly minted wallet and saves the proposal it came to file", async () => {
    // Not indexed, so the route reconciles the one wallet; that puts the caller
    // into the participant set, and the save proceeds without a manual retry.
    store.isWalletParticipant.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    store.isWalletIndexed.mockResolvedValue(false);
    indexer.reconcileWalletUnit.mockResolvedValue(true);
    store.createProposalRecord.mockResolvedValue({ id: "proposal-1" });

    const response = await POST(createRequest());

    expect(response.status).toBe(201);
    expect(indexer.reconcileWalletUnit).toHaveBeenCalledWith(`${POLICY}${ASSET_NAME}`);
    expect(store.createProposalRecord).toHaveBeenCalled();
  });

  it("answers not a member when reconciling indexed the wallet but excludes the caller", async () => {
    store.isWalletParticipant.mockResolvedValue(false);
    store.isWalletIndexed.mockResolvedValue(false);
    indexer.reconcileWalletUnit.mockResolvedValue(true);

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "You are not a participant of this wallet." });
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

  it("rejects an authority path that disagrees with the on-chain operator path", async () => {
    store.isWalletParticipant.mockResolvedValue(true);

    const response = await POST(
      createRequest({
        authorityPath: "admin",
        buildContext: buildContext("stt-spend", "use", "multisig")
      })
    );

    expect(response.status).toBe(400);
    expect(store.createProposalRecord).not.toHaveBeenCalled();
  });

  it("rejects transaction bytes that disagree with the accepted build context", async () => {
    store.isWalletParticipant.mockResolvedValue(true);
    transactionBinding.assertProposalTransactionBinding.mockImplementationOnce(() => {
      throw new InvalidProposalBuildContextError("Transaction redeemer mismatch.");
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(400);
    expect(transactionBinding.assertProposalTransactionBinding).toHaveBeenCalledTimes(1);
    const bindingInput = transactionBinding.assertProposalTransactionBinding.mock.calls[0]![0];
    expect(bindingInput.unsignedTxHex).toBe("80");
    expect(bindingInput.buildContext).toMatchObject({ builder: "stt-spend", mode: "use" });
    expect(store.createProposalRecord).not.toHaveBeenCalled();
  });

  it.each(SUPPORTED_BUILDERS)("accepts the supported %s build context", async (builder) => {
    store.isWalletParticipant.mockResolvedValue(true);
    store.createProposalRecord.mockResolvedValue({ id: `proposal-${builder}` });

    const response = await POST(
      createRequest({
        builder,
        buildContext: buildContext(builder)
      })
    );

    expect(response.status).toBe(201);
    expect(store.createProposalRecord).toHaveBeenCalled();
  });

  it.each(UNSUPPORTED_BUILDERS)("rejects the unsupported %s build context", async (builder) => {
    store.isWalletParticipant.mockResolvedValue(true);

    const response = await POST(
      createRequest({
        builder,
        buildContext: {
          builder,
          config: {
            sttAssetNameHex: ASSET_NAME,
            walletPolicyId: POLICY,
            walletAssetNameHex: ASSET_NAME
          },
          input:
            builder === "wallet-spend"
              ? { walletInputTxHash: "cc".repeat(32), walletInputOutputIndex: 0 }
              : {}
        }
      })
    );

    expect(response.status).toBe(400);
    expect(store.createProposalRecord).not.toHaveBeenCalled();
  });

  it.each(CREATABLE_STT_SPEND_MODES)(
    "accepts the operator-authorized stt-spend mode %s",
    async (mode) => {
      store.isWalletParticipant.mockResolvedValue(true);
      store.createProposalRecord.mockResolvedValue({ id: `proposal-${mode}` });

      const response = await POST(
        createRequest({
          builder: "stt-spend",
          buildContext: buildContext("stt-spend", mode)
        })
      );

      expect(response.status).toBe(201);
      expect(store.createProposalRecord).toHaveBeenCalled();
    }
  );

  it.each(DIRECT_ONLY_STT_SPEND_MODES)(
    "rejects the non-operator stt-spend mode %s",
    async (mode) => {
      store.isWalletParticipant.mockResolvedValue(true);

      const response = await POST(
        createRequest({
          builder: "stt-spend",
          buildContext: buildContext("stt-spend", mode)
        })
      );

      expect(response.status).toBe(400);
      expect(store.createProposalRecord).not.toHaveBeenCalled();
    }
  );
});
