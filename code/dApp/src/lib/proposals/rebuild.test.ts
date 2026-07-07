import assert from "node:assert/strict";
import test from "node:test";
import { type BrowserWallet } from "@meshsdk/core";
import { isAutoRebuildable, RebuildUnsupportedError, rebuildProposalTx } from "@/lib/proposals/rebuild";
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
