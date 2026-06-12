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
      wizardSelectedAction === "wallet-propose"
    ) {
      return walletOperatorPath === "multisig" ? "Co-signers" : "Admin";
    }

    if (
      wizardSelectedAction === "use" ||
      wizardSelectedAction === "update-state" ||
      wizardSelectedAction === "manage-streaming-payments"
    ) {
      return sttAuthorityPath === "multisig" ? "Co-signers" : "Admin";
    }

    if (wizardSelectedAction === "consolidate-utxo") {
      if (consolidateAuthorityPath === "multisig") {
        return "Co-signers";
      }

      if (consolidateAuthorityPath === "beneficiary") {
        return "Recovery contact";
      }

      return "Admin";
    }

    if (wizardSelectedAction === "use-allowance") {
      return "User";
    }

    if (wizardSelectedAction === "use-beneficiary") {
      return "Recovery contact";
    }

    if (wizardSelectedAction === "payout-streaming-payment") {
      return "Rule-driven";
    }

    if (wizardSelectedAction === "renew-proof-of-life") {
      return "Eligible user";
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
        label: "Connect wallet",
        description: walletReady ? "Ready on Preprod." : "Use a Preprod browser wallet.",
        status: walletStepStatus
      },
      {
        label: "Choose people",
        description: mintHasOwnerChoice ? "People are set." : "Add at least one owner.",
        status: peopleStatus
      },
      {
        label: "Confirm",
        description:
          selectedAction === "mint" && preview?.txHex && previewMatchesSelectedAction
            ? "Ready in your wallet."
            : "Review, then continue in your wallet.",
        status: previewStatus
      }
    ];

    if (showSharedReferenceSetup) {
      steps.splice(1, 0, {
        label: "Create helper",
        description: sharedSttReferenceStoreLoading
          ? "Checking the setup helper."
          : "Create it once if needed.",
        status: helperStatus
      });
    }

    return steps;
}
