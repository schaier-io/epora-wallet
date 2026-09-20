"use client";

import type {
  UserActionKind
} from "@/components/user/flow-types";

import {
  type AuthorityPath,
  type ConsolidateAuthorityPath,
  type OperatorAuthorityPath } from "@/lib/types/contracts";
import { type BrowserWallet } from "@meshsdk/core";
import { type SetupProgressStep } from "@/components/user/workspace/types";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceWorkspaceGuidedDerivations.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceWorkspaceGuidedDerivations", defaultMessages);

export interface SelectedPathLabelCtx {
  sttAuthorityPath: AuthorityPath;
  consolidateAuthorityPath: ConsolidateAuthorityPath;
  walletOperatorPath: OperatorAuthorityPath;
  wizardSelectedAction: UserActionKind | null;
}

export function computeSelectedPathLabel(ctx: SelectedPathLabelCtx): string | null {
  const {
    sttAuthorityPath,
    consolidateAuthorityPath,
    walletOperatorPath,
    wizardSelectedAction
  } = ctx;
    if (!wizardSelectedAction) {
      return null;
    }

    if (
      wizardSelectedAction === "wallet-withdraw" ||
      wizardSelectedAction === "wallet-publish" ||
      wizardSelectedAction === "wallet-vote"
    ) {
      return walletOperatorPath === "multisig" ? i18n("coSigners") : i18n("owner");
    }

    if (
      wizardSelectedAction === "use" ||
      wizardSelectedAction === "update-state" ||
      wizardSelectedAction === "manage-streaming-payments"
    ) {
      return sttAuthorityPath === "multisig" ? i18n("coSigners") : i18n("owner");
    }

    if (wizardSelectedAction === "consolidate-utxo") {
      if (consolidateAuthorityPath === "multisig") {
        return i18n("coSigners");
      }

      if (consolidateAuthorityPath === "beneficiary") {
        return i18n("recoveryContact");
      }

      return i18n("owner");
    }

    if (wizardSelectedAction === "use-allowance") {
      return i18n("spender");
    }

    if (wizardSelectedAction === "use-beneficiary" || wizardSelectedAction === "stop-beneficiary-stream" || wizardSelectedAction === "distribute-beneficiaries") {
      return i18n("recoveryContact");
    }

    if (wizardSelectedAction === "payout-streaming-payment") {
      return i18n("ruleDriven");
    }

    if (wizardSelectedAction === "renew-proof-of-life") {
      return i18n("allowedPerson");
    }

    if (wizardSelectedAction === "lock-funds") {
      return i18n("walletSigner");
    }

    return null;
}

export interface MintSetupStepsCtx {
  activeWallet: BrowserWallet | null;
  /** The only truthful "Confirm is finished" signal: the mint was seen on chain
   * (`mintConfirmationAtom?.phase === "confirmed"`). A built preview is not it.
   * Optional: when the caller does not thread it, absent reads as not confirmed. */
  mintConfirmed?: boolean;
  mintHasOwnerChoice: boolean;
  networkId: number | null;
  walletReady: boolean;
}

export function computeMintSetupSteps(ctx: MintSetupStepsCtx): SetupProgressStep[] {
  const {
    activeWallet,
    mintConfirmed = false,
    mintHasOwnerChoice,
    networkId,
    walletReady
  } = ctx;
    const walletStepStatus: SetupProgressStep["status"] = walletReady
      ? "done"
      : activeWallet && networkId !== 0
        ? "blocked"
        : "active";
    const peopleStatus: SetupProgressStep["status"] = mintHasOwnerChoice
      ? "done"
      : walletReady
        ? "active"
        : "waiting";
    // A built preview is an unsigned transaction: `preview.txHex` says the app assembled
    // a draft, not that the wallet signed or the chain accepted anything. Marking the
    // step "done" on that signal badged Confirm as DONE and counted 3/3 for a mint that
    // did not exist yet. The preview therefore never completes this step. Only an
    // on-chain mint confirmation does, so the stepper can still reach 3/3 truthfully.
    const previewStatus: SetupProgressStep["status"] = mintConfirmed
      ? "done"
      : mintHasOwnerChoice && walletReady
        ? "active"
        : "waiting";

    const steps: SetupProgressStep[] = [
      {
        label: i18n("connectWallet"),
        description: walletReady ? i18n("readyOnPreprod") : i18n("useAPreprodBrowserWallet"),
        status: walletStepStatus
      },
      {
        label: i18n("choosePeople"),
        description: mintHasOwnerChoice ? i18n("peopleAreSet") : i18n("addAtLeastOneOwner"),
        status: peopleStatus,
        targetId: "mint-section-people"
      },
      {
        label: i18n("confirm"),
        // "Ready in your wallet." read as "the wallet already has it". The instruction is
        // the same before and after the preview builds: read the review rail, then sign.
        description: i18n("reviewThenContinueInYourWallet"),
        status: previewStatus
      }
    ];

    return steps;
}
