import {
  BadgeCheck,
  CalendarArrowDown,
  Combine,
  Coins,
  Clock3,
  FileSignature,
  FileText,
  HandCoins,
  HandHeart,
  Repeat,
  Settings2,
  ShieldPlus,
  WalletCards
} from "lucide-react";
import {
  IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
  type TaskDefinition,
  type UserActionKind
} from "@/components/user/flow-types";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibUserFlowActionDefinitions.json";

const i18n = createDefaultTranslator("LibUserFlowActionDefinitions", defaultMessages);

// Static catalog of every guided user action: what it does, who it's for, and
// which prerequisites gate it. Pure data (icon fields hold component
// references, never JSX). Rendering lives in the workspace views, and the
// setup-readiness derivation lives in ./setup-readiness.ts.

type TaskUxMetadata = Pick<
  TaskDefinition,
  "setupCTA" | "routeExplanation" | "receiptSummary"
>;

const USER_ACTION_UX_METADATA: Record<UserActionKind, TaskUxMetadata> = {
  mint: {
    setupCTA: i18n("connectWallet"),
    routeExplanation: i18n("mintRouteExplanation")
  },
  "lock-funds": {
    setupCTA: i18n("prepareReceiveAddress"),
    routeExplanation: i18n("lockFundsRouteExplanation")
  },
  use: {
    setupCTA: i18n("finishSetup"),
    routeExplanation: i18n("useRouteExplanation")
  },
  "use-allowance": {
    setupCTA: i18n("chooseMatchingWallet"),
    routeExplanation: i18n("allowanceRouteExplanation")
  },
  "use-beneficiary": {
    setupCTA: i18n("chooseRecoveryContactWallet"),
    routeExplanation: i18n("recoveryContactRouteExplanation")
  },
  "payout-streaming-payment": {
    setupCTA: i18n("loadScheduledPayments"),
    routeExplanation: i18n("payoutRouteExplanation")
  },
  "wallet-withdraw": {
    // No `receiptSummary`: `wallet-withdraw` has its own branch in
    // workspace-review-receipt.ts, which names the amount and the reward address and
    // says when there is nothing to claim. This sentence would never be read.
    setupCTA: i18n("finishSetup"),
    routeExplanation: i18n("withdrawRouteExplanation")
  },
  "set-intended-stake-credential": {
    receiptSummary: i18n("enableStakingReceiptSummary"),
    setupCTA: i18n("chooseWhoApproves"),
    routeExplanation: i18n("enableStakingRouteExplanation")
  },
  "update-state": {
    setupCTA: i18n("chooseWhoApproves"),
    routeExplanation: i18n("updateStateRouteExplanation")
  },
  "manage-streaming-payments": {
    setupCTA: i18n("chooseWhoApproves"),
    routeExplanation: i18n("manageStreamingPaymentsRouteExplanation")
  },
  "consolidate-utxo": {
    setupCTA: i18n("loadFunds"),
    routeExplanation: i18n("consolidateRouteExplanation")
  },
  "wallet-publish": {
    receiptSummary: i18n("publishReceiptSummary"),
    setupCTA: i18n("finishSetup"),
    routeExplanation: i18n("publishRouteExplanation")
  },
  "wallet-vote": {
    receiptSummary: i18n("voteReceiptSummary"),
    setupCTA: i18n("finishSetup"),
    routeExplanation: i18n("voteRouteExplanation")
  },
  "renew-proof-of-life": {
    receiptSummary: i18n("proofOfLifeReceiptSummary"),
    setupCTA: i18n("finishSetup"),
    routeExplanation: i18n("proofOfLifeRouteExplanation")
  }
};

const BASE_USER_ACTION_DEFINITIONS: TaskDefinition[] = [
  {
    kind: "mint",
    label: i18n("createWallet"),
    shortLabel: i18n("create"),
    description: i18n("createANewWallet"),
    outcome: i18n("createsTheWalletAndAddsItsFirstFunds"),
    whenToUse: i18n("mintWhenToUse"),
    whatChanges: i18n("createsTheWalletNameOwnersOptionalRecoveryContacts"),
    pathLabels: [i18n("owner")],
    surfaceLabel: i18n("newWalletSetup"),
    startingPoint: i18n("mintStartingPoint"),
    icon: ShieldPlus,
    prerequisites: ["wallet", "preprod"],
    risk: "medium"
  },
  {
    kind: "lock-funds",
    label: i18n("addFunds"),
    shortLabel: i18n("addFunds"),
    description: i18n("getTheAddressOrAddMoney"),
    outcome: i18n("addsFundsToThisSmartWallet"),
    whenToUse: i18n("lockFundsWhenToUse"),
    whatChanges: i18n("createsOneOrMoreFundPoolsAtThe"),
    pathLabels: [i18n("connectedWallet")],
    surfaceLabel: i18n("receiveAndDeposit"),
    startingPoint: i18n("lockFundsStartingPoint"),
    icon: WalletCards,
    prerequisites: ["wallet", "preprod", "locking-contract"],
    risk: "low"
  },
  {
    kind: "use",
    label: i18n("sendFunds"),
    shortLabel: i18n("send"),
    description: i18n("sendMoneyFromThisWallet"),
    outcome: i18n("sendsSelectedFundsToARecipientWhileKeeping"),
    whenToUse: i18n("useWhenToUse"),
    whatChanges:
      i18n("theRecipientReceivesTheAssetsYouChoosePeople_d262cc"),
    pathLabels: [i18n("owner"), i18n("coSigners")],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: i18n("useStartingPoint"),
    icon: HandCoins,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    risk: "medium"
  },
  {
    kind: "use-allowance",
    label: i18n("useAllowance"),
    shortLabel: i18n("allowance"),
    description: i18n("sendWithinASpendingLimit"),
    outcome: i18n("sendsFundsWithinOneSpenderSDailyLimit"),
    whenToUse: i18n("allowanceWhenToUse"),
    whatChanges: i18n("theRecipientGetsPaidAndTheRemainingAllowance"),
    pathLabels: [i18n("spender")],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: i18n("allowanceStartingPoint"),
    icon: BadgeCheck,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    risk: "low"
  },
  {
    kind: "use-beneficiary",
    label: i18n("useRecoveryContactAccess"),
    shortLabel: i18n("recoveryContact"),
    description: i18n("sendAfterRecoveryContactUnlock"),
    outcome: i18n("sendsFundsUsingTheWalletSRecoveryContact"),
    whenToUse: i18n("recoveryContactWhenToUse"),
    whatChanges:
      i18n("theRecoveryContactReceivesFundsUpToThe"),
    pathLabels: [i18n("recoveryContact")],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: i18n("recoveryContactStartingPoint"),
    icon: HandHeart,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    risk: "medium"
  },
  {
    kind: "payout-streaming-payment",
    label: i18n("payScheduledPayments"),
    shortLabel: i18n("pay"),
    description: i18n("payWhatAScheduledPaymentOwes"),
    outcome: i18n("paysWhatOneOrMoreScheduledPaymentsOwe"),
    whenToUse: i18n("payoutWhenToUse"),
    whatChanges: i18n("recipientsGetPaidAndTheWalletRecordsThe"),
    pathLabels: [i18n("schedule")],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: i18n("payoutStartingPoint"),
    icon: CalendarArrowDown,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    risk: "medium"
  },
  {
    kind: "wallet-withdraw",
    label: i18n("claimStakingRewards"),
    shortLabel: i18n("staking"),
    description: i18n("collectAdaRewardsEarnedFromStaking"),
    outcome:
      i18n("collectsStakingRewardsWhileKeepingThisWalletS"),
    whenToUse: i18n("withdrawWhenToUse"),
    whatChanges:
      i18n("rewardsAreCollectedAndTheWalletStateIs"),
    pathLabels: [i18n("owner"), i18n("coSigners")],
    surfaceLabel: i18n("stakingRewards"),
    startingPoint: i18n("withdrawStartingPoint"),
    icon: Coins,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    risk: "medium"
  },
  {
    kind: "set-intended-stake-credential",
    label: i18n("enableStaking"),
    shortLabel: i18n("enableStaking"),
    description: i18n("setTheWalletSStakeAddressSoIt"),
    outcome:
      i18n("turnsOnStakingByRecordingTheWalletS"),
    whenToUse: i18n("enableStakingWhenToUse"),
    whatChanges:
      i18n("theWalletSStakeAddressIsSetExisting"),
    pathLabels: [i18n("owner"), i18n("coSigners")],
    surfaceLabel: i18n("stakingRewards"),
    startingPoint: i18n("enableStakingStartingPoint"),
    icon: ShieldPlus,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    risk: "medium"
  },
  {
    kind: "update-state",
    label: i18n("updateWalletSettings"),
    shortLabel: i18n("settings"),
    description: i18n("editPeopleRecoveryAndTheProofOfLife"),
    outcome: i18n("savesChangesToPeopleRecoveryContactsApprovalsOr"),
    whenToUse: i18n("updateStateWhenToUse"),
    whatChanges:
      i18n("updatesWalletSettingsExistingFundsStayInThe"),
    pathLabels: [i18n("owner"), i18n("coSigners")],
    surfaceLabel: i18n("walletSettings"),
    startingPoint: i18n("updateStateStartingPoint"),
    icon: Settings2,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    risk: "high"
  },
  {
    kind: "manage-streaming-payments",
    label: i18n("manageScheduledPayments"),
    shortLabel: i18n("scheduledPayments"),
    description: i18n("addOrUpdateScheduledPayments"),
    outcome: i18n("savesTheSchedulePayingWhatItOwesIs"),
    whenToUse: i18n("manageStreamingPaymentsWhenToUse"),
    whatChanges:
      i18n("changesOnlyTheScheduledPaymentsPeopleAndOther"),
    pathLabels: [i18n("owner"), i18n("coSigners")],
    surfaceLabel: i18n("scheduledPayments"),
    startingPoint: i18n("manageStreamingPaymentsStartingPoint"),
    icon: Repeat,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    risk: "high"
  },
  {
    kind: "consolidate-utxo",
    label: i18n("tidyWalletFunds"),
    shortLabel: i18n("tidy"),
    description: i18n("mergeSmallFundPoolsIntoOneToSave"),
    // "UTxO", "stake-address" and "intended address" are the chain's words for something the
    // rest of the app already says plainly: the wallet-home notice calls this "Move it back".
    outcome: i18n("mergesTheWalletSFundPoolsOrMoves"),
    whenToUse: i18n("consolidateWhenToUse"),
    whatChanges:
      i18n("fundsStayInTheWalletTheyEndUp"),
    pathLabels: [i18n("owner"), i18n("coSigners"), i18n("recoveryContact")],
    surfaceLabel: i18n("walletMaintenance"),
    startingPoint: i18n("consolidateStartingPoint"),
    icon: Combine,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract", "locked-utxos"],
    risk: "medium"
  },
  {
    kind: "wallet-publish",
    label: i18n("publishCertificate"),
    shortLabel: i18n("publish"),
    description: i18n("registerTheWalletForStakingOrGovernance"),
    outcome:
      i18n("sendsTheCertificateYouPasteToCardanoOn"),
    whenToUse: i18n("publishWhenToUse"),
    whatChanges:
      i18n("publishesTheCertificateAndCarriesTheWalletState"),
    pathLabels: [i18n("owner"), i18n("coSigners")],
    surfaceLabel: i18n("governance"),
    startingPoint: i18n("publishStartingPoint"),
    icon: FileText,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    risk: "high"
  },
  {
    kind: "wallet-vote",
    label: i18n("castVote"),
    shortLabel: i18n("vote"),
    description: i18n("voteOnACardanoGovernanceProposal"),
    outcome:
      i18n("castsTheVoteYouPasteOnACardano"),
    whenToUse: i18n("voteWhenToUse"),
    whatChanges:
      i18n("castsTheVoteAndCarriesTheWalletState"),
    pathLabels: [i18n("owner"), i18n("coSigners")],
    surfaceLabel: i18n("governance"),
    startingPoint: i18n("voteStartingPoint"),
    icon: FileSignature,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    risk: "high"
  },
  {
    kind: "renew-proof-of-life",
    label: i18n("refreshProofOfLife"),
    shortLabel: i18n("refresh"),
    description: i18n("keepRecoveryContactUnlockDelayed"),
    outcome: i18n("refreshesTheWalletProofOfLifeWithoutSending"),
    whenToUse: i18n("proofOfLifeWhenToUse"),
    whatChanges:
      i18n("movesTheProofOfLifeForwardWithinThe"),
    pathLabels: [i18n("allowedPerson")],
    surfaceLabel: i18n("wakeUpTimer"),
    startingPoint: i18n("proofOfLifeStartingPoint"),
    icon: Clock3,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference"],
    risk: "medium"
  }
];

export const USER_ACTION_DEFINITIONS: TaskDefinition[] = BASE_USER_ACTION_DEFINITIONS.map(
  (definition) => ({
    ...definition,
    ...USER_ACTION_UX_METADATA[definition.kind]
  })
);

export const USER_ACTION_DEFINITION_MAP = Object.fromEntries(
  USER_ACTION_DEFINITIONS.map((definition) => [definition.kind, definition])
) as Record<UserActionKind, TaskDefinition>;
