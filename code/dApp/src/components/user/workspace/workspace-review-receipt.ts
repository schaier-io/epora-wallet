"use client";

import type {
  UserActionKind
} from "@/components/user/flow-types";
import {
  type ReviewReceiptItem
} from "@/components/user/review-panel";

import {
  countAdminUsersInStateForm,
  type StateFormState
} from "@/lib/contracts/state-form";
import {
  normalizeWalletName } from "@/lib/contracts/state-wallet-name";

import {
  type Asset,
  type PayoutTransfer,
  type WalletInputRef } from "@/lib/types/contracts";
import { type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { formatCountLabel, formatDraftWalletName, formatReceiptAmountSummary, mergeAmountLists } from "@/components/user/workspace/helpers";

export interface ReviewReceipt {
  title: string;
  summary: string;
  items: ReviewReceiptItem[];
}

export interface ReviewReceiptCtx {
  mintStateForm: StateFormState;
  mintStarterAssets: Asset[];
  sttStateForm: StateFormState;
  sttExtraTransfers: TransferFormState[];
  sttWalletInputs: WalletInputRef[];
  consolidateWalletInputs: WalletInputRef[];
  consolidateWalletOutputs: WalletScriptOutputFormState[];
  lockFundsAssets: Asset[];
  activeActionDefinition: { label: string };
  activeActionDraft: { ready: boolean };
  lockingContract: { address: string | null };
  mintHasOwnerChoice: boolean;
  mintOwnerCount: number;
  selectedAction: UserActionKind;
  selectedPathLabel: string | null;
  sharedSttReferenceStoreLoading: boolean;
  showSharedReferenceSetup: boolean;
  streamingPaymentPayoutTransfers: PayoutTransfer[];
}

export function computeReviewReceipt(ctx: ReviewReceiptCtx): ReviewReceipt {
  const {
    mintStateForm,
    mintStarterAssets,
    sttStateForm,
    sttExtraTransfers,
    sttWalletInputs,
    consolidateWalletInputs,
    consolidateWalletOutputs,
    lockFundsAssets,
    activeActionDefinition,
    activeActionDraft,
    lockingContract,
    mintHasOwnerChoice,
    mintOwnerCount,
    selectedAction,
    selectedPathLabel,
    sharedSttReferenceStoreLoading,
    showSharedReferenceSetup,
    streamingPaymentPayoutTransfers
  } = ctx;
    if (selectedAction === "mint") {
      const draftWalletName = formatDraftWalletName(mintStateForm.walletName);
      const hasDraftWalletName = mintStateForm.walletName.trim().length > 0;

      return {
        title: "Create wallet",
        summary: `${
          hasDraftWalletName ? `Creates ${draftWalletName}` : "Creates a new wallet"
        } with ${formatCountLabel(mintOwnerCount, "owner")} and adds ${formatReceiptAmountSummary(
          mintStarterAssets
        )} as the first balance.`,
        items: [
          {
            label: "Wallet",
            value: draftWalletName,
            tone: hasDraftWalletName ? "success" : "warning"
          },
          {
            label: "Owners",
            value: formatCountLabel(mintOwnerCount, "owner"),
            detail:
              mintOwnerCount > 0
                ? null
                : "Add an owner or confirm the recovery-only setup.",
            tone: mintHasOwnerChoice ? "success" : "warning"
          },
          {
            label: "Starter funds",
            value: formatReceiptAmountSummary(mintStarterAssets),
            tone: "success"
          },
          ...(mintStateForm.beneficiaries.length > 0
            ? [
                {
                  label: "Recovery contacts",
                  value: formatCountLabel(
                    mintStateForm.beneficiaries.length,
                    "person",
                    "people"
                  )
                }
              ]
            : []),
          ...(showSharedReferenceSetup
            ? [
                {
                  label: "One-time helper",
                  value: sharedSttReferenceStoreLoading ? "Checking" : "Needed first",
                  tone: "warning" as const
                }
              ]
            : [])
        ]
      };
    }

    if (selectedAction === "lock-funds") {
      return {
        title: "Receive funds receipt",
        summary: `You are adding ${formatReceiptAmountSummary(
          lockFundsAssets
        )} to the selected wallet.`,
        items: [
          {
            label: "Amount",
            value: formatReceiptAmountSummary(lockFundsAssets),
            tone: lockFundsAssets.length > 0 ? "success" : "warning"
          },
          {
            label: "Destination",
            value: lockingContract.address ? "Selected wallet" : "Address loading",
            detail: "Funds are sent to this wallet's receive address.",
            tone: lockingContract.address ? "success" : "warning"
          }
        ]
      };
    }

    if (selectedAction === "payout-streaming-payment") {
      const payoutAmount = mergeAmountLists(
        streamingPaymentPayoutTransfers.map((transfer) => transfer.amount)
      );

      return {
        title: "Streaming payment receipt",
        summary: `You are paying ${formatCountLabel(
          streamingPaymentPayoutTransfers.length,
          "scheduled payment"
        )} from ${formatCountLabel(sttWalletInputs.length, "fund pool")}.`,
        items: [
          {
            label: "Payments",
            value: formatCountLabel(streamingPaymentPayoutTransfers.length, "payment"),
            tone: streamingPaymentPayoutTransfers.length > 0 ? "success" : "warning"
          },
          {
            label: "Amount",
            value: formatReceiptAmountSummary(payoutAmount),
            tone: payoutAmount.length > 0 ? "success" : "warning"
          },
          {
            label: "Funding",
            value: formatCountLabel(sttWalletInputs.length, "fund pool"),
            detail: "Selected wallet funds pay the due streaming payments.",
            tone: sttWalletInputs.length > 0 ? "success" : "warning"
          }
        ]
      };
    }

    if (
      selectedAction === "use" ||
      selectedAction === "use-allowance" ||
      selectedAction === "use-beneficiary"
    ) {
      const transferAmount = mergeAmountLists(
        sttExtraTransfers.map((transfer) => transfer.amount)
      );

      return {
        title: "Send receipt",
        summary: `You are sending ${formatReceiptAmountSummary(
          transferAmount
        )} from ${formatCountLabel(sttWalletInputs.length, "fund pool")}.`,
        items: [
          {
            label: "Recipients",
            value: formatCountLabel(sttExtraTransfers.length, "recipient"),
            tone: sttExtraTransfers.length > 0 ? "success" : "warning"
          },
          {
            label: "Amount",
            value: formatReceiptAmountSummary(transferAmount),
            tone: transferAmount.length > 0 ? "success" : "warning"
          },
          {
            label: "Funding",
            value: formatCountLabel(sttWalletInputs.length, "fund pool"),
            detail: "Selected wallet funds are used for this send.",
            tone: sttWalletInputs.length > 0 ? "success" : "warning"
          }
        ]
      };
    }

    if (selectedAction === "update-state" || selectedAction === "manage-streaming-payments") {
      return {
        title: "Wallet update receipt",
        summary: `You are updating this wallet with ${
          selectedPathLabel?.toLowerCase() ?? "approved"
        } access.`,
        items: [
          {
            label: "Name",
            value: normalizeWalletName(sttStateForm.walletName)
          },
          {
            label: "Owners",
            value: formatCountLabel(countAdminUsersInStateForm(sttStateForm), "owner")
          },
          {
            label: "Recovery contacts",
            value: formatCountLabel(
              sttStateForm.beneficiaries.length,
              "person",
              "people"
            )
          },
          {
            label: "Streaming payments",
            value: formatCountLabel(sttStateForm.streamingPayments.length, "rule")
          }
        ]
      };
    }

    if (selectedAction === "consolidate-utxo") {
      return {
        title: "Tidy funds receipt",
        summary: `You are merging ${formatCountLabel(
          consolidateWalletInputs.length,
          "fund pool"
        )} into fewer wallet entries.`,
        items: [
          {
            label: "Sources",
            value: formatCountLabel(consolidateWalletInputs.length, "fund pool"),
            tone: consolidateWalletInputs.length > 0 ? "success" : "warning"
          },
          {
            label: "New entries",
            value:
              consolidateWalletOutputs.length > 0
                ? formatCountLabel(consolidateWalletOutputs.length, "entry", "entries")
                : "Auto",
            detail: "The app can create one merged entry automatically."
          }
        ]
      };
    }

    return {
      title: "Action receipt",
      summary: `You are preparing ${activeActionDefinition.label.toLowerCase()}.`,
      items: [
        {
          label: "Action",
          value: activeActionDefinition.label
        },
        {
          label: "Status",
          value: activeActionDraft.ready ? "Ready" : "Needs setup",
          tone: activeActionDraft.ready ? "success" : "warning"
        }
      ]
    };
}
