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
    lockingContract,
    mintHasOwnerChoice,
    mintOwnerCount,
    selectedAction,
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

        ]
      };
    }

    if (selectedAction === "lock-funds") {
      return {
        // "Add funds receipt". The rail sat beside a card headed "Add funds", under a
        // sidebar entry that now also says "Add funds", and called the same action
        // "Receive funds". One destination, one name.
        title: i18n("addFundsReceipt"),
        // Branch on the formatted value, not on `lockFundsAssets.length`: the editor seeds a
        // blank asset row, so the array is non-empty long before it holds an amount.
        summary: formatReceiptAmountSummary(lockFundsAssets, "")
          ? i18n("youAreAddingValue1ToTheSelectedWallet", { value1: formatReceiptAmountSummary(lockFundsAssets) })
          : // See the note on the empty summary below: the Next step box owns the instruction.
            "",
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
            : // Same as the other empty summaries: the Next step box owns the instruction.
              "",
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
            // No detail for the smart-wallet branch. It read "Selected smart-wallet funds
            // pay the due scheduled payments." beside a row labelled FUNDING on a receipt
            // headed "Scheduled payment receipt": the pools you picked pay for the thing
            // you are paying. The other two branches each say something the row does not:
            // that smart-wallet funds are NOT spent, and which records get removed.
            detail:
              sttWalletInputs.length > 0
                ? undefined
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
      // The short form scans in the narrow review rail. The copy control carries the full
      // address without printing the same destination again below it.
      const recipientItems: ReviewReceiptItem[] =
        sttExtraTransfers.length === 0
          ? [
              {
                label: i18n("recipient_903432"),
                value: i18n("noneAddedYet"),
                // No "Add the address you want to send to." under "None added yet.": the
                // detail restated the value as an instruction, and the rail's Next step
                // box owns the instruction. Same reason the empty summary above is "".
                tone: "warning" as const
              }
            ]
          : sttExtraTransfers.map((transfer, index) => ({
              label: sttExtraTransfers.length === 1 ? i18n("recipient_903432") : i18n("recipientValue1", { value1: index + 1 }),
              value: i18n("amountToRecipient", {
                amount: formatReceiptAmountSummary(transfer.amount),
                recipient: shortenAddress(transfer.address)
              }),
              copyValue: transfer.address,
              copyLabel: i18n("copyRecipientAddress"),
              copiedLabel: i18n("recipientAddressCopied"),
              tone: "success" as const
            }));

      return {
        title: i18n("sendReceipt"),
        // Empty, not "Choose a recipient and amount to see what this sends." The rail's
        // own "Next step" box says "Choose a recipient and amount, then preview your
        // send." two boxes below, and the receipt's own rows already read "None added
        // yet" / "0 fund pools". A receipt summarises what will happen; it does not
        // instruct.
        // No "from 1 fund pool". Which UTxOs the wallet spends is how Cardano works, not
        // something the reader decided about this send, and the count said nothing they
        // could act on. See the FUNDING row below for the one case where it does.
        summary:
          sttExtraTransfers.length > 0
            ? i18n("youAreSendingAmount", {
                amount: formatReceiptAmountSummary(transferAmount)
              })
            : "",
        items: [
          ...recipientItems,
          ...(selectedAction === "use-beneficiary" && sttBaselineStateForm?.beneficiaries.length
            ? [{
                label: i18n("recoveryAccess"),
                value: i18n(sttBaselineStateForm.beneficiaries.length === 1 ? "beneficiaryAccessRetained" : "beneficiaryAccessRemoved"),
                detail: i18n(sttBaselineStateForm.beneficiaries.length === 1 ? "beneficiaryRetainedDetail" : "beneficiaryRemovedDetail"),
                tone: sttBaselineStateForm.beneficiaries.length === 1 ? "success" as const : "warning" as const
              }]
            : []),
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
          // Only while there is nothing to spend from. "1 fund pool" under the detail
          // "The fund pools you choose pay for this send." was a tautology about a number
          // the reader cannot use: the send goes through either way, and a receipt says
          // what will happen. At zero the row is the blocker, so it stays.
          ...(sttWalletInputs.length === 0
            ? [
                {
                  label: i18n("funding"),
                  value: formatCountLabel(sttWalletInputs.length, "fundPool"),
                  tone: "warning" as const
                }
              ]
            : [])
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

      // `manage-streaming-payments` shares the diff, not the story. Both actions rewrite
      // the same datum, so the rows are identical work, but titling a schedule edit
      // "Wallet update receipt" over "…about who can use this wallet" described the one
      // thing that action does not touch.
      const isScheduleUpdate = selectedAction === "manage-streaming-payments";

      return {
        title: isScheduleUpdate ? i18n("scheduleUpdateReceipt") : i18n("walletUpdateReceipt"),
        summary: stateChange.isDiff
          ? isScheduleUpdate
            ? i18n("whatThisTransactionChangesAboutTheScheduledPayments")
            : i18n("whatThisTransactionChangesAboutWhoCanUse")
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
            : // Empty on purpose, so the receipt shows no subtitle before anything is staged.
              // These empty-state sentences ended with the same imperative the Next step box
              // below them already gives ("Choose the fund pools you want to merge."), so the
              // rail asked for one thing twice. The rows still say what is staged.
              "",
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
        // The staking row alone while staking is off. The two rows below describe a claim
        // that cannot be built yet: the amount is read from the chain once staking is on,
        // and the reward address comes from the staking script the wallet does not have.
        items: !isWalletStakingEnabled
          ? [
              {
                label: i18n("staking"),
                value: i18n("notOn"),
                tone: "warning",
                detail: i18n("aWalletThatDelegatesToNothingEarnsNothing")
              }
            ]
          : [
          {
            label: i18n("staking"),
            value: i18n("on"),
            tone: "success",
            detail: null
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
      // No rows. The two this branch used to build, ACTION and STATUS, are said again
      // within a screen of here: the action's name heads the configuration card in the
      // middle column and the primary button reads "Confirm <label>", and the readiness
      // is the sentence above that button ("Ready to sign." / "Not built yet.",
      // `review-panel-preview.tsx`). An action with real data to show has its own branch
      // above; this fallback only had the two labels.
      items: []
    };
}
