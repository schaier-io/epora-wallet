"use client";

import type {
  UserActionKind
} from "@/components/user/flow-types";

import {
  type BuildResult,
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
      return walletOperatorPath === "multisig" ? i18n("requiredApprovals") : i18n("owner");
    }

    if (
      wizardSelectedAction === "use" ||
      wizardSelectedAction === "update-state" ||
      wizardSelectedAction === "manage-streaming-payments"
    ) {
      return sttAuthorityPath === "multisig" ? i18n("requiredApprovals") : i18n("owner");
    }

    if (wizardSelectedAction === "consolidate-utxo") {
      if (consolidateAuthorityPath === "multisig") {
        return i18n("requiredApprovals");
      }

      if (consolidateAuthorityPath === "beneficiary") {
        return i18n("recoveryContact");
      }

      return i18n("owner");
    }

    if (wizardSelectedAction === "use-allowance") {
      return i18n("spender");
    }

    if (wizardSelectedAction === "use-beneficiary") {
      return i18n("recoveryContact");
    }

    if (wizardSelectedAction === "payout-streaming-payment") {
      return i18n("scheduledPaymentRule");
    }

    if (wizardSelectedAction === "renew-proof-of-life") {
      return i18n("eligibleSigner");
    }

    if (wizardSelectedAction === "lock-funds") {
      return i18n("connectedWallet");
    }

    return null;
}

export interface MintSetupStepsCtx {
  activeWallet: BrowserWallet | null;
  mintHasOwnerChoice: boolean;
  networkId: number | null;
  preview: BuildResult | null;
  previewMatchesSelectedAction: boolean;
  selectedAction: UserActionKind;
  sharedReferenceReady: boolean;
  sharedSttReferenceStoreLoading: boolean;
  showSharedReferenceSetup: boolean;
  walletReady: boolean;
}

export function computeMintSetupSteps(ctx: MintSetupStepsCtx): SetupProgressStep[] {
  const {
    activeWallet,
    mintHasOwnerChoice,
    networkId,
    preview,
    previewMatchesSelectedAction,
    selectedAction,
    sharedReferenceReady,
    sharedSttReferenceStoreLoading,
    showSharedReferenceSetup,
    walletReady
  } = ctx;
    const walletStepStatus: SetupProgressStep["status"] = walletReady
      ? "done"
      : activeWallet && networkId !== 0
        ? "blocked"
        : "active";
    const helperStatus: SetupProgressStep["status"] = sharedReferenceReady
      ? "done"
      : sharedSttReferenceStoreLoading
        ? "active"
      : walletReady
        ? "active"
        : "waiting";
    const peopleStatus: SetupProgressStep["status"] = mintHasOwnerChoice
      ? "done"
      : walletReady
        ? "active"
        : "waiting";
    const previewStatus: SetupProgressStep["status"] =
      selectedAction === "mint" && preview?.txHex && previewMatchesSelectedAction
        ? "done"
        : mintHasOwnerChoice && walletReady
          ? "active"
          : "waiting";

    const steps: SetupProgressStep[] = [
      {
        label: i18n("connectWallet"),
        description: walletReady ? i18n("readyOnPreprod") : i18n("usePreprodBrowserWallet"),
        status: walletStepStatus
      },
      {
        label: i18n("choosePeople"),
        description: mintHasOwnerChoice ? i18n("peopleAreSet") : i18n("addAtLeastOneOwner"),
        status: peopleStatus
      },
      {
        label: i18n("reviewAndCreate"),
        description:
          selectedAction === "mint" && preview?.txHex && previewMatchesSelectedAction
            ? i18n("approvedAndSubmitted")
            : i18n("reviewThenApprove"),
        status: previewStatus
      }
    ];

    if (showSharedReferenceSetup) {
      steps.splice(1, 0, {
        label: i18n("prepareTransactions"),
        description: sharedSttReferenceStoreLoading
          ? i18n("checkingOneTimeSetup")
          : i18n("oneSetupTransactionShared"),
        status: helperStatus
      });
    }

    return steps;
}
