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
      return walletOperatorPath === "multisig" ? "Co-signers" : "Owner";
    }

    if (
      wizardSelectedAction === "use" ||
      wizardSelectedAction === "update-state" ||
      wizardSelectedAction === "manage-streaming-payments"
    ) {
      return sttAuthorityPath === "multisig" ? "Co-signers" : "Owner";
    }

    if (wizardSelectedAction === "consolidate-utxo") {
      if (consolidateAuthorityPath === "multisig") {
        return "Co-signers";
      }

      if (consolidateAuthorityPath === "beneficiary") {
        return "Recovery contact";
      }

      return "Owner";
    }

    if (wizardSelectedAction === "use-allowance") {
      return "Spender";
    }

    if (wizardSelectedAction === "use-beneficiary") {
      return "Recovery contact";
    }

    if (wizardSelectedAction === "payout-streaming-payment") {
      return "Rule-driven";
    }

    if (wizardSelectedAction === "renew-proof-of-life") {
      return "Allowed person";
    }

    if (wizardSelectedAction === "lock-funds") {
      return "Wallet signer";
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
        description:
          selectedAction === "mint" && preview?.txHex && previewMatchesSelectedAction
            ? i18n("readyInYourWallet")
            : i18n("reviewThenContinueInYourWallet"),
        status: previewStatus
      }
    ];

    if (showSharedReferenceSetup) {
      steps.splice(1, 0, {
        label: i18n("createHelper"),
        description: sharedSttReferenceStoreLoading
          ? i18n("checkingTheSetupHelper")
          : i18n("createItOnceIfNeeded"),
        status: helperStatus,
        targetId: "mint-section-helper"
      });
    }

    return steps;
}
