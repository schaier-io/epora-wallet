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
import { buildStateChangeItems } from "@/components/user/workspace/workspace-state-diff";
import { shortenAddress } from "@/lib/utils/explorer";

export interface ReviewReceipt {
  title: string;
  summary: string;
  items: ReviewReceiptItem[];
}

export interface ReviewReceiptCtx {
  mintStateForm: StateFormState;
  /** The wallet's current on-chain state, so `update-state` can show a diff and not a snapshot. */
  sttBaselineStateForm: StateFormState | null;
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
  sharedSttReferenceStoreLoading: boolean;
  showSharedReferenceSetup: boolean;
  streamingPaymentPayoutTransfers: PayoutTransfer[];
}

export function computeReviewReceipt(ctx: ReviewReceiptCtx): ReviewReceipt {
  const {
    mintStateForm,
    sttBaselineStateForm,
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
        } with ${formatCountLabel(mintOwnerCount, "owner")}${
          formatReceiptAmountSummary(mintStarterAssets, "")
            ? ` and adds ${formatReceiptAmountSummary(mintStarterAssets)} as the first balance.`
            : ". No starting balance is staged yet."
        }`,
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
        // Branch on the formatted value, not on `lockFundsAssets.length`: the editor seeds a
        // blank asset row, so the array is non-empty long before it holds an amount.
        summary: formatReceiptAmountSummary(lockFundsAssets, "")
          ? `You are adding ${formatReceiptAmountSummary(lockFundsAssets)} to the selected wallet.`
          : "Nothing is staged yet. Add an amount to see what this adds.",
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
      const fundingSummary =
        sttWalletInputs.length > 0
          ? formatCountLabel(sttWalletInputs.length, "fund pool")
          : streamingPaymentPayoutTransfers.length > 0
            ? "Connected wallet"
            : "No value transfer";
      // The row above reads as a label; the sentence below needs a phrase. Lower-casing the
      // label gave "using connected wallet." and "using no value transfer."
      const fundingPhrase =
        sttWalletInputs.length > 0
          ? formatCountLabel(sttWalletInputs.length, "fund pool")
          : "the connected wallet";

      return {
        title: "Scheduled payment receipt",
        summary:
          streamingPaymentPayoutTransfers.length > 0
            ? `You are paying ${formatCountLabel(
                streamingPaymentPayoutTransfers.length,
                "scheduled payment"
              )} using ${fundingPhrase}.`
            : "Nothing is staged yet. Add a due payment to see what this pays.",
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
            value: fundingSummary,
            detail:
              sttWalletInputs.length > 0
                ? "Selected smart-wallet funds pay the due scheduled payments."
                : streamingPaymentPayoutTransfers.length > 0
                  ? "The connected wallet funds the tagged outputs; smart-wallet funds are not spent."
                  : "Only fully settled schedule records are removed.",
            tone: "success"
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

      // Name the recipients. `1 recipient` told the user nothing they could check, and the
      // destination is the one field on this screen that address-swapping malware targets.
      // The short form scans; the full address on the detail line is what they verify.
      const recipientItems: ReviewReceiptItem[] =
        sttExtraTransfers.length === 0
          ? [
              {
                label: "Recipient",
                value: "None added yet",
                detail: "Add the address you want to send to.",
                tone: "warning" as const
              }
            ]
          : sttExtraTransfers.map((transfer, index) => ({
              label: sttExtraTransfers.length === 1 ? "Recipient" : `Recipient ${index + 1}`,
              value: `${formatReceiptAmountSummary(transfer.amount)} to ${shortenAddress(
                transfer.address
              )}`,
              detail: transfer.address,
              tone: "success" as const
            }));

      const singleRecipient =
        sttExtraTransfers.length === 1 ? shortenAddress(sttExtraTransfers[0]!.address) : null;

      return {
        title: "Send receipt",
        summary:
          sttExtraTransfers.length > 0
            ? `You are sending ${formatReceiptAmountSummary(transferAmount)}${
                singleRecipient ? ` to ${singleRecipient}` : ""
              } from ${formatCountLabel(sttWalletInputs.length, "fund pool")}.`
            : "Nothing is staged yet. Add a payout to see what this sends.",
        items: [
          ...recipientItems,
          // Only worth a row once it is more than the one recipient row already says.
          ...(sttExtraTransfers.length > 1
            ? [
                {
                  label: "Total",
                  value: formatReceiptAmountSummary(transferAmount),
                  tone: "success" as const
                }
              ]
            : []),
          {
            label: "Funding",
            value: formatCountLabel(sttWalletInputs.length, "fund pool"),
            detail: "The fund pools you choose pay for this send.",
            tone: sttWalletInputs.length > 0 ? "success" : "warning"
          }
        ]
      };
    }

    if (selectedAction === "update-state" || selectedAction === "manage-streaming-payments") {
      // A diff, not a snapshot of the result. See `workspace-state-diff.ts` for why.
      const stateChange = buildStateChangeItems(sttBaselineStateForm, sttStateForm, [
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
          value: formatCountLabel(sttStateForm.beneficiaries.length, "person", "people")
        },
        {
          label: "Scheduled payments",
          value: formatCountLabel(sttStateForm.streamingPayments.length, "scheduled payment")
        }
      ]);

      return {
        title: "Wallet update receipt",
        summary: stateChange.isDiff
          ? "What this transaction changes about who can use this wallet."
          : // No baseline loaded, so the rows below describe the result, not the change.
            "This wallet's current rules have not loaded, so this shows the result, not what changed.",
        items: stateChange.items
      };
    }

    if (selectedAction === "consolidate-utxo") {
      return {
        title: "Tidy funds receipt",
        summary:
          consolidateWalletInputs.length > 0
            ? `You are merging ${formatCountLabel(
                consolidateWalletInputs.length,
                "fund pool"
              )} into fewer, larger ones.`
            : "Nothing is staged yet. Pick the fund pools you want to merge.",
        items: [
          {
            label: "Sources",
            value: formatCountLabel(consolidateWalletInputs.length, "fund pool"),
            tone: consolidateWalletInputs.length > 0 ? "success" : "warning"
          },
          {
            label: "New fund pools",
            value:
              consolidateWalletOutputs.length > 0
                ? formatCountLabel(consolidateWalletOutputs.length, "fund pool")
                : "Auto",
            detail: "The app can merge them into one pool automatically."
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
