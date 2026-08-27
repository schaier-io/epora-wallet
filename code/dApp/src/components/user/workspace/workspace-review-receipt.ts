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
import { formatDraftWalletName, formatReceiptAmountSummary, mergeAmountLists } from "@/components/user/workspace/helpers";
import { createDefaultTranslator } from "@/i18n/default-translator";
import countMessages from "@/i18n/generated/default-en/Counts.json";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceWorkspaceReviewReceipt.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceWorkspaceReviewReceipt", defaultMessages);
const countI18n = createDefaultTranslator("Counts", countMessages);

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
        title: i18n("createWallet"),
        summary: i18n("value1WithValue2AndAddsValue3AsThe", { value1: hasDraftWalletName ? i18n("createsNamedWallet", { walletName: draftWalletName }) : i18n("createsNewWallet"), value2: countI18n("owner", { count: mintOwnerCount }), value3: formatReceiptAmountSummary(
          mintStarterAssets
        ) }),
        items: [
          {
            label: i18n("wallet"),
            value: draftWalletName,
            tone: hasDraftWalletName ? "success" : "warning"
          },
          {
            label: i18n("owners"),
            value: countI18n("owner", { count: mintOwnerCount }),
            detail:
              mintOwnerCount > 0
                ? null
                : i18n("addOwnerOrConfirmNoDirectOwner"),
            tone: mintHasOwnerChoice ? "success" : "warning"
          },
          {
            label: i18n("starterFunds"),
            value: formatReceiptAmountSummary(mintStarterAssets),
            tone: "success"
          },
          ...(mintStateForm.beneficiaries.length > 0
            ? [
                {
                  label: i18n("recoveryContacts"),
                  value: countI18n("person", { count: mintStateForm.beneficiaries.length })
                }
              ]
            : []),
          ...(showSharedReferenceSetup
            ? [
                {
                  label: i18n("oneTimeSetup"),
                  value: sharedSttReferenceStoreLoading ? i18n("checking") : i18n("requiredFirst"),
                  tone: "warning" as const
                }
              ]
            : [])
        ]
      };
    }

    if (selectedAction === "lock-funds") {
      return {
        title: i18n("addFunds"),
        summary: i18n("addsValue1ToTheSelectedWallet", { value1: formatReceiptAmountSummary(
          lockFundsAssets
        ) }),
        items: [
          {
            label: i18n("amount"),
            value: formatReceiptAmountSummary(lockFundsAssets),
            tone: lockFundsAssets.length > 0 ? "success" : "warning"
          },
          {
            label: i18n("destination"),
            value: lockingContract.address ? i18n("selectedWallet") : i18n("addressLoading"),
            detail: i18n("fundsAreSentToThisWalletSReceive"),
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
          ? countI18n("fundPool", { count: sttWalletInputs.length })
          : streamingPaymentPayoutTransfers.length > 0
            ? i18n("connectedWallet")
            : i18n("noValueTransfer");

      return {
        title: i18n("payScheduledPayments"),
        summary: i18n("paysValue1UsingValue2", { value1: countI18n("payment", { count: streamingPaymentPayoutTransfers.length }), value2: fundingSummary.toLowerCase() }),
        items: [
          {
            label: i18n("payments"),
            value: countI18n("payment", { count: streamingPaymentPayoutTransfers.length }),
            tone: streamingPaymentPayoutTransfers.length > 0 ? "success" : "warning"
          },
          {
            label: i18n("amount"),
            value: formatReceiptAmountSummary(payoutAmount),
            tone: payoutAmount.length > 0 ? "success" : "warning"
          },
          {
            label: i18n("funding"),
            value: fundingSummary,
            detail:
              sttWalletInputs.length > 0
                ? i18n("selectedSmartWalletFundsPay")
                : streamingPaymentPayoutTransfers.length > 0
                  ? i18n("connectedWalletFundsPayout")
                  : i18n("onlySettledSchedulesRemoved"),
            tone: "success"
          }
        ]
      };
    }

    if (selectedAction === "use-beneficiary") {
      const transferAmount = mergeAmountLists(
        sttExtraTransfers.map((transfer) => transfer.amount)
      );

      return {
        title: i18n("recoveryWithdrawal"),
        summary: i18n("withdrawsValue1FromValue2", { value1: formatReceiptAmountSummary(
          transferAmount
        ), value2: countI18n("fundPool", { count: sttWalletInputs.length }) }),
        items: [
          {
            label: i18n("destination"),
            value: countI18n("recipient", { count: sttExtraTransfers.length }),
            tone: sttExtraTransfers.length > 0 ? "success" : "warning"
          },
          {
            label: i18n("amount"),
            value: formatReceiptAmountSummary(transferAmount),
            tone: transferAmount.length > 0 ? "success" : "warning"
          },
          {
            label: i18n("recoveryContact"),
            value: i18n("removedAfterWithdrawal"),
            detail: i18n("thisIsIrreversibleTheContactCannotWithdrawFrom"),
            tone: "warning"
          }
        ]
      };
    }

    if (selectedAction === "use" || selectedAction === "use-allowance") {
      const transferAmount = mergeAmountLists(
        sttExtraTransfers.map((transfer) => transfer.amount)
      );

      return {
        title: i18n("sendFunds"),
        summary: i18n("sendsValue1FromValue2", { value1: formatReceiptAmountSummary(
          transferAmount
        ), value2: countI18n("fundPool", { count: sttWalletInputs.length }) }),
        items: [
          {
            label: i18n("recipients"),
            value: countI18n("recipient", { count: sttExtraTransfers.length }),
            tone: sttExtraTransfers.length > 0 ? "success" : "warning"
          },
          {
            label: i18n("amount"),
            value: formatReceiptAmountSummary(transferAmount),
            tone: transferAmount.length > 0 ? "success" : "warning"
          },
          {
            label: i18n("funding"),
            value: countI18n("fundPool", { count: sttWalletInputs.length }),
            detail: i18n("selectedWalletFundsAreUsedForThisSend"),
            tone: sttWalletInputs.length > 0 ? "success" : "warning"
          }
        ]
      };
    }

    if (selectedAction === "update-state" || selectedAction === "manage-streaming-payments") {
      return {
        title: i18n("updateWallet"),
        summary: i18n("replacesTheCurrentWalletSettingsAfterApprovalBy", { value1: selectedPathLabel?.toLowerCase() ?? i18n("anEligibleSigner") }),
        items: [
          {
            label: i18n("name"),
            value: normalizeWalletName(sttStateForm.walletName)
          },
          {
            label: i18n("owners"),
            value: countI18n("owner", { count: countAdminUsersInStateForm(sttStateForm) })
          },
          {
            label: i18n("recoveryContacts"),
            value: countI18n("person", { count: sttStateForm.beneficiaries.length })
          },
          {
            label: i18n("scheduledPayments"),
            value: countI18n("rule", { count: sttStateForm.streamingPayments.length })
          }
        ]
      };
    }

    if (selectedAction === "consolidate-utxo") {
      return {
        title: i18n("tidyFunds"),
        summary: i18n("mergesValue1IntoFewerWalletEntries", { value1: countI18n("fundPool", { count: consolidateWalletInputs.length }) }),
        items: [
          {
            label: i18n("sources"),
            value: countI18n("fundPool", { count: consolidateWalletInputs.length }),
            tone: consolidateWalletInputs.length > 0 ? "success" : "warning"
          },
          {
            label: i18n("newEntries"),
            value:
              consolidateWalletOutputs.length > 0
                ? countI18n("entry", { count: consolidateWalletOutputs.length })
                : i18n("auto"),
            detail: i18n("eporaCanCreateOneMergedFundPoolAutomatically")
          }
        ]
      };
    }

    return {
      title: i18n("actionReview"),
      summary: i18n("preparesValue1ForApproval", { value1: activeActionDefinition.label.toLowerCase() }),
      items: [
        {
          label: i18n("action"),
          value: activeActionDefinition.label
        },
        {
          label: i18n("status"),
          value: activeActionDraft.ready ? i18n("ready") : i18n("needsSetup"),
          tone: activeActionDraft.ready ? "success" : "warning"
        }
      ]
    };
}
