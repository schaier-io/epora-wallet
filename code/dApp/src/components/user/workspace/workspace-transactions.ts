"use client";
// Composition root for the workspace transaction layer. The pieces live in:
//   workspace-transactions-forms.ts           — jotai form snapshot
//   workspace-transactions-wallet-builders.ts — mint / lock / wallet ops
//   workspace-transactions-stt-builders.ts    — STT spend family + consolidate
//   workspace-transactions-submit.ts          — sign-and-submit flow
// This file wires them together behind the original createWorkspaceTransactions
// API and owns the per-action dispatch.
import { hasFieldErrors, isSttFlowAction } from "@/components/user/workspace/helpers";
import { readWorkspaceFormSnapshot } from "@/components/user/workspace/workspace-transactions-forms";
import { createWalletActionBuilders } from "@/components/user/workspace/workspace-transactions-wallet-builders";
import { createSttSpendBuilders } from "@/components/user/workspace/workspace-transactions-stt-builders";
import { createSubmitHandlers } from "@/components/user/workspace/workspace-transactions-submit";
import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";

export function createWorkspaceTransactions(ctx: WorkspaceTransactionsCtx) {
  const {
    activeFieldErrors,
    activeReadinessIssues,
    selectedAction,
    setBuildError,
    setBuildErrorDetails
  } = ctx;
  const forms = readWorkspaceFormSnapshot(ctx.jotaiStore);
  const walletBuilders = createWalletActionBuilders(ctx, forms);
  const sttBuilders = createSttSpendBuilders(ctx, forms);

  async function buildSelectedActionTx() {
    if (hasFieldErrors(activeFieldErrors)) {
      setBuildError("Fix the highlighted fields before continuing.");
      setBuildErrorDetails(null);
      return null;
    }

    if (activeReadinessIssues.some((issue) => issue.blocking)) {
      setBuildError("Finish the setup checklist before continuing.");
      setBuildErrorDetails(null);
      return null;
    }

    if (selectedAction === "mint") {
      return walletBuilders.buildMintTx();
    }

    if (selectedAction === "lock-funds") {
      return walletBuilders.buildLockFunds();
    }

    if (selectedAction === "wallet-spend") {
      return walletBuilders.buildWalletSpend();
    }

    if (selectedAction === "wallet-withdraw") {
      return walletBuilders.buildWalletWithdraw();
    }

    if (selectedAction === "wallet-publish") {
      return walletBuilders.buildWalletPublish();
    }

    if (selectedAction === "set-intended-stake-credential") {
      return walletBuilders.buildSetIntendedStakeCredential();
    }

    if (selectedAction === "wallet-propose") {
      return walletBuilders.buildWalletPropose();
    }

    if (!isSttFlowAction(selectedAction)) {
      setBuildError("The selected action is not wired to a builder yet.");
      setBuildErrorDetails(null);
      return null;
    }

    forms.setSelectedSttAction(selectedAction);
    return sttBuilders.buildSelectedSttActionTx();
  }

  const submitHandlers = createSubmitHandlers(ctx, forms, { buildSelectedActionTx });

  return {
    ...walletBuilders,
    ...sttBuilders,
    buildSelectedActionTx,
    ...submitHandlers
  };
}
