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
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceWorkspaceReviewReceipt.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceWorkspaceReviewReceipt", defaultMessages);

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
  activeActionDefinition: { label: string; receiptSummary?: string };
  activeActionDraft: { ready: boolean };
  lockingContract: { address: string | null };
  mintHasOwnerChoice: boolean;
  mintOwnerCount: number;
  selectedAction: UserActionKind;
  sharedSttReferenceStoreLoading: boolean;
  showSharedReferenceSetup: boolean;
  streamingPaymentPayoutTransfers: PayoutTransfer[];
  /** `intended_stake_credential` is `Some`. With `None` the wallet has earned nothing. */
  isWalletStakingEnabled: boolean;
  withdrawAmount: string;
  withdrawRewardAddress: string;
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
    streamingPaymentPayoutTransfers,
    isWalletStakingEnabled,
    withdrawAmount,
    withdrawRewardAddress
  } = ctx;
    if (selectedAction === "mint") {
      const draftWalletName = formatDraftWalletName(mintStateForm.walletName);
      const hasDraftWalletName = mintStateForm.walletName.trim().length > 0;

      return {
        title: i18n("createWallet"),
        summary: formatReceiptAmountSummary(mintStarterAssets, "")
          ? i18n("createsWalletWithOwnersAndBalance", {
              wallet: hasDraftWalletName ? draftWalletName : i18n("aNewWallet"),
              owners: formatCountLabel(mintOwnerCount, "owner"),
              balance: formatReceiptAmountSummary(mintStarterAssets)
            })
          : i18n("createsWalletWithOwnersWithoutBalance", {
              wallet: hasDraftWalletName ? draftWalletName : i18n("aNewWallet"),
              owners: formatCountLabel(mintOwnerCount, "owner")
            }),
        items: [
          {
            label: i18n("wallet"),
            value: draftWalletName,
            tone: hasDraftWalletName ? "success" : "warning"
          },
          {
            label: i18n("owners"),
            value: formatCountLabel(mintOwnerCount, "owner"),
            detail:
              mintOwnerCount > 0
                ? null
                : i18n("addAnOwnerOrConfirmTheRecoveryOnly"),
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
                  value: formatCountLabel(
                    mintStateForm.beneficiaries.length,
                    "person"
                  )
                }
              ]
            : []),
          ...(showSharedReferenceSetup
            ? [
                {
                  label: i18n("oneTimeHelper"),
                  value: sharedSttReferenceStoreLoading ? i18n("checking") : i18n("neededFirst"),
                  tone: "warning" as const
                }
              ]
            : [])
        ]
      };
    }

    if (selectedAction === "lock-funds") {
      return {
        title: i18n("receiveFundsReceipt"),
        // Branch on the formatted value, not on `lockFundsAssets.length`: the editor seeds a
        // blank asset row, so the array is non-empty long before it holds an amount.
        summary: formatReceiptAmountSummary(lockFundsAssets, "")
          ? i18n("youAreAddingValue1ToTheSelectedWallet", { value1: formatReceiptAmountSummary(lockFundsAssets) })
          : i18n("nothingIsStagedYetAddAnAmountTo"),
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
          ? formatCountLabel(sttWalletInputs.length, "fundPool")
          : streamingPaymentPayoutTransfers.length > 0
            ? i18n("connectedWallet")
            : i18n("noValueTransfer");
      // The row above reads as a label; the sentence below needs a phrase. Lower-casing the
      // label gave "using connected wallet." and "using no value transfer."
      const fundingPhrase =
        sttWalletInputs.length > 0
          ? formatCountLabel(sttWalletInputs.length, "fundPool")
          : i18n("theConnectedWallet");

      return {
        title: i18n("scheduledPaymentReceipt"),
        summary:
          streamingPaymentPayoutTransfers.length > 0
            ? i18n("youArePayingValue1UsingFundingphrase", { value1: formatCountLabel(
                streamingPaymentPayoutTransfers.length,
                "scheduledPayment"
              ), fundingPhrase: fundingPhrase })
            : i18n("nothingIsStagedYetAddADuePayment"),
        items: [
          {
            label: i18n("payments"),
            value: formatCountLabel(streamingPaymentPayoutTransfers.length, "payment"),
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
                ? i18n("selectedSmartWalletFundsPayTheDueScheduled")
                : streamingPaymentPayoutTransfers.length > 0
                  ? i18n("theConnectedWalletFundsTheTaggedOutputsSmart")
                  : i18n("onlyFullySettledScheduleRecordsAreRemoved"),
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
                label: i18n("recipient_903432"),
                value: i18n("noneAddedYet"),
                detail: i18n("addTheAddressYouWantToSendTo"),
                tone: "warning" as const
              }
            ]
          : sttExtraTransfers.map((transfer, index) => ({
              label: sttExtraTransfers.length === 1 ? i18n("recipient_903432") : i18n("recipientValue1", { value1: index + 1 }),
              value: i18n("amountToRecipient", {
                amount: formatReceiptAmountSummary(transfer.amount),
                recipient: shortenAddress(transfer.address)
              }),
              detail: transfer.address,
              copyValue: transfer.address,
              tone: "success" as const
            }));

      const singleRecipient =
        sttExtraTransfers.length === 1 ? shortenAddress(sttExtraTransfers[0]!.address) : null;

      return {
        title: i18n("sendReceipt"),
        summary:
          sttExtraTransfers.length > 0
            ? singleRecipient
              ? i18n("youAreSendingAmountToRecipientFromFunding", {
                  amount: formatReceiptAmountSummary(transferAmount),
                  recipient: singleRecipient,
                  funding: formatCountLabel(sttWalletInputs.length, "fundPool")
                })
              : i18n("youAreSendingAmountFromFunding", {
                  amount: formatReceiptAmountSummary(transferAmount),
                  funding: formatCountLabel(sttWalletInputs.length, "fundPool")
                })
            : i18n("nothingIsStagedYetAddAPayoutTo"),
        items: [
          ...recipientItems,
          // Only worth a row once it is more than the one recipient row already says.
          ...(sttExtraTransfers.length > 1
            ? [
                {
                  label: i18n("total"),
                  value: formatReceiptAmountSummary(transferAmount),
                  tone: "success" as const
                }
              ]
            : []),
          {
            label: i18n("funding"),
            value: formatCountLabel(sttWalletInputs.length, "fundPool"),
            detail: i18n("theFundPoolsYouChoosePayForThis"),
            tone: sttWalletInputs.length > 0 ? "success" : "warning"
          }
        ]
      };
    }

    if (selectedAction === "update-state" || selectedAction === "manage-streaming-payments") {
      // A diff, not a snapshot of the result. See `workspace-state-diff.ts` for why.
      const stateChange = buildStateChangeItems(sttBaselineStateForm, sttStateForm, [
        {
          label: i18n("name"),
          value: normalizeWalletName(sttStateForm.walletName)
        },
        {
          label: i18n("owners"),
          value: formatCountLabel(countAdminUsersInStateForm(sttStateForm), "owner")
        },
        {
          label: i18n("recoveryContacts"),
          value: formatCountLabel(sttStateForm.beneficiaries.length, "person")
        },
        {
          label: i18n("scheduledPayments"),
          value: formatCountLabel(sttStateForm.streamingPayments.length, "scheduledPayment")
        }
      ]);

      return {
        title: i18n("walletUpdateReceipt"),
        summary: stateChange.isDiff
          ? i18n("whatThisTransactionChangesAboutWhoCanUse")
          : // No baseline loaded, so the rows below describe the result, not the change.
            i18n("thisWalletSCurrentRulesHaveNotLoaded"),
        items: stateChange.items
      };
    }

    if (selectedAction === "consolidate-utxo") {
      return {
        title: i18n("tidyFundsReceipt"),
        summary:
          consolidateWalletInputs.length > 0
            ? i18n("youAreMergingValue1IntoFewerLargerOnes", { value1: formatCountLabel(
                consolidateWalletInputs.length,
                "fundPool"
              ) })
            : i18n("nothingIsStagedYetPickTheFundPools"),
        items: [
          {
            label: i18n("sources"),
            value: formatCountLabel(consolidateWalletInputs.length, "fundPool"),
            tone: consolidateWalletInputs.length > 0 ? "success" : "warning"
          },
          {
            label: i18n("newFundPools"),
            value:
              consolidateWalletOutputs.length > 0
                ? formatCountLabel(consolidateWalletOutputs.length, "fundPool")
                : i18n("auto"),
            detail: i18n("theAppCanMergeThemIntoOnePool")
          }
        ]
      };
    }

    if (selectedAction === "wallet-withdraw") {
      // Without a branch this fell to the generic `Action` + `Status` pair, which printed
      // `Ready` beside the config view's own "staking is not on" warning. The amount and
      // the address the rewards come from are the two things the person is agreeing to.
      const amountSummary = formatReceiptAmountSummary([
        { unit: "lovelace", quantity: withdrawAmount }
      ]);
      return {
        title: i18n("claimRewardsReceipt"),
        summary: isWalletStakingEnabled
          ? i18n("youAreMovingAmountsummaryOfEarnedStakingRewards", { amountSummary: amountSummary })
          : i18n("stakingIsNotOnForThisWalletYet"),
        items: [
          {
            label: i18n("staking"),
            value: isWalletStakingEnabled ? i18n("on") : i18n("notOn"),
            tone: isWalletStakingEnabled ? "success" : "warning",
            detail: isWalletStakingEnabled
              ? null
              : i18n("aWalletThatDelegatesToNothingEarnsNothing")
          },
          {
            label: i18n("amount"),
            value: amountSummary,
            // The field defaults to 1 ADA, a fixed starting value rather than the balance
            // actually earned. The wallet does not read the earned amount, so the honest
            // thing is to say what happens when the number is too high.
            detail: i18n("theClaimFailsIfThisIsMoreThan")
          },
          {
            label: i18n("rewardsComeFrom"),
            value: withdrawRewardAddress
              ? shortenAddress(withdrawRewardAddress)
              : i18n("notSet"),
            tone: withdrawRewardAddress ? "default" : "warning",
            detail: withdrawRewardAddress || null,
            copyValue: withdrawRewardAddress
          }
        ]
      };
    }

    return {
      title: i18n("actionReceipt"),
      // `receiptSummary` is a whole sentence written per action. The fallback below
      // lower-cases a verb-phrase label and drops the article, so it read "You are
      // preparing claim staking rewards." for every action without a branch of its own.
      summary:
        activeActionDefinition.receiptSummary ??
        i18n("youArePreparingValue1", { value1: activeActionDefinition.label.toLowerCase() }),
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
