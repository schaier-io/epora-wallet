import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGuidedActionDrafts,
  type GuidedActionDraftContext
} from "@/components/user/guided-action-adapters";
import type { ReadinessIssue, UserActionKind } from "@/components/user/flow-types";

const ACTIONS: UserActionKind[] = [
  "mint", "use", "renew-proof-of-life", "update-state", "manage-streaming-payments",
  "use-allowance", "use-beneficiary", "stop-beneficiary-stream", "distribute-beneficiaries",
  "payout-streaming-payment", "consolidate-utxo", "lock-funds", "wallet-withdraw",
  "wallet-publish", "wallet-vote", "set-intended-stake-credential"
];

function draftContext(detectedTokenActive: boolean): GuidedActionDraftContext {
  const actionReadinessMap = Object.fromEntries(
    ACTIONS.map((action) => [action, [] as ReadinessIssue[]])
  ) as Record<UserActionKind, ReadinessIssue[]>;

  return {
    actionReadinessMap,
    mint: {
      adminUserCount: 0, currentStateJson: "", defaultStateJson: "",
      starterFundsJson: "", defaultStarterFundsJson: "", starterFundsSummary: ""
    },
    stt: {
      inputHash: "", walletInputCount: 0, walletOutputCount: 0, transferCount: 0,
      streamingPaymentTransferCount: 0, authorityPath: "admin", detectedTokenActive
    },
    useAllowance: { matchedUserId: null },
    consolidate: {
      inputHash: "", walletInputCount: 0, walletOutputCount: 0, authorityPath: "admin"
    },
    lockFunds: { assetCount: 0, hasCustomInlineDatum: false },
    walletWithdraw: {
      rewardAddress: "", amount: "1000000", sttInputHash: "", authorityPath: "admin"
    },
    walletPublish: { certificateJson: "", sttInputHash: "", authorityPath: "admin" },
    walletVote: { voteJson: "", sttInputHash: "", authorityPath: "admin" }
  };
}

test("enable staking asks for a wallet first instead of a constant confirm hint", () => {
  const withoutWallet = buildGuidedActionDrafts(draftContext(false));
  const withWallet = buildGuidedActionDrafts(draftContext(true));

  assert.equal(
    withoutWallet["set-intended-stake-credential"].nextStep,
    "Pick a smart wallet first."
  );
  assert.match(
    withWallet["set-intended-stake-credential"].nextStep ?? "",
    /Confirm enabling staking/
  );
});
