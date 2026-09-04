import assert from "node:assert/strict";
import test from "node:test";
import { type BrowserWallet } from "@meshsdk/core";
import {
  isAutoRebuildable,
  RebuildUnsupportedError,
  refreshContextForRebuild,
  rebuildProposalTx
} from "@/lib/proposals/rebuild";
import type { ProposalBuildContext, ProposalDetailDto } from "@/lib/proposals/types";

test("isAutoRebuildable allows the state-forwarding builders", () => {
  for (const builder of [
    "stt-spend",
    "wallet-withdraw",
    "wallet-publish",
    "wallet-vote",
    "set-intended-stake-credential",
    "consolidate-utxo"
  ] as const) {
    assert.equal(isAutoRebuildable(builder), true, builder);
  }
});

test("isAutoRebuildable rejects builders with a moving or absent consumed input", () => {
  for (const builder of ["wallet-spend", "lock-funds", "mint"] as const) {
    assert.equal(isAutoRebuildable(builder), false, builder);
  }
});

test("rebuildProposalTx refuses a proposal with no saved build context", async () => {
  await assert.rejects(
    () => rebuildProposalTx({} as ProposalDetailDto, null, {} as unknown as BrowserWallet),
    RebuildUnsupportedError
  );
});

test("rebuildProposalTx refuses a non-auto-rebuildable builder before any chain access", async () => {
  const context = { builder: "mint" } as unknown as ProposalBuildContext;
  await assert.rejects(
    () => rebuildProposalTx({} as ProposalDetailDto, context, {} as unknown as BrowserWallet),
    RebuildUnsupportedError
  );
});

/**
 * The rebuild false-success: "Make a new version" replaced the record and reset
 * the signatures, but the rebuilt transaction was born holding the ORIGINAL
 * build's validity window (the builders prefer an input-carried reference time
 * over the current clock), so the fresh request expired the moment it existed
 * and the check still said the validity window had closed. The refresh has to
 * drop that stamp, not just re-point the state input.
 */
test("refreshContextForRebuild re-points the state input and drops the stale validity stamp", () => {
  const context = {
    builder: "stt-spend",
    mode: "use",
    config: { walletPolicyId: "bb".repeat(28), walletAssetNameHex: "01" },
    input: {
      sttInputTxHash: "cc".repeat(32),
      sttInputOutputIndex: 0,
      validityWindowReferenceTimeMs: Date.now() - 3_600_000,
      recipient: "addr_test1recipient"
    }
  } as unknown as ProposalBuildContext;

  const refreshed = refreshContextForRebuild(context, {
    txHash: "dd".repeat(32),
    index: 3
  });

  const input = refreshed.input as {
    sttInputTxHash: string;
    sttInputOutputIndex: number;
    validityWindowReferenceTimeMs?: number;
    recipient?: string;
  };
  assert.equal(input.sttInputTxHash, "dd".repeat(32));
  assert.equal(input.sttInputOutputIndex, 3);
  assert.equal(
    input.validityWindowReferenceTimeMs,
    undefined,
    "the original build's validity stamp must not survive a rebuild"
  );
  // Everything the proposer actually proposed stays untouched.
  assert.equal(input.recipient, "addr_test1recipient");
});
