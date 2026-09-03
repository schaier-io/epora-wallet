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
  "audience" | "availabilityReason" | "setupCTA" | "routeExplanation" | "receiptSummary"
>;

const USER_ACTION_UX_METADATA: Record<UserActionKind, TaskUxMetadata> = {
  mint: {
    audience: "admin",
    availabilityReason: "Available after connecting a preprod wallet.",
    setupCTA: "Connect wallet",
    routeExplanation: "This creates a new smart wallet and prepares it for receiving funds."
  },
  "lock-funds": {
    audience: "everyday",
    availabilityReason: "Available once the wallet receive address is ready.",
    setupCTA: "Prepare receive address",
    routeExplanation:
      "This shows the wallet receive address and lets you add funds."
  },
  use: {
    audience: "everyday",
    availabilityReason: "Available when the connected wallet is allowed to send funds.",
    setupCTA: "Finish setup",
    routeExplanation: "This is the normal send flow for this wallet."
  },
  "use-allowance": {
    audience: "everyday",
    availabilityReason: "Available when this wallet can spend from a daily allowance.",
    setupCTA: "Choose matching wallet",
    routeExplanation: "This sends funds using the allowance already saved on this wallet."
  },
  "use-beneficiary": {
    audience: "everyday",
    availabilityReason: "Available when the selected wallet grants recovery-contact access.",
    setupCTA: "Choose recovery-contact wallet",
    routeExplanation: "This sends funds using the recovery-contact rules on this wallet."
  },
  "payout-streaming-payment": {
    audience: "everyday",
    availabilityReason: "Available when the selected wallet has scheduled payments ready to pay.",
    setupCTA: "Load scheduled payments",
    routeExplanation: "This pays what a scheduled payment owes and records the payment."
  },
  "wallet-withdraw": {
    // No `receiptSummary`: `wallet-withdraw` has its own branch in
    // workspace-review-receipt.ts, which names the amount and the reward address and
    // says when there is nothing to claim. This sentence would never be read.
    audience: "expert",
    availabilityReason: "Available when this wallet can approve staking actions.",
    setupCTA: "Finish setup",
    routeExplanation: "This collects staking rewards for this wallet."
  },
  "set-intended-stake-credential": {
    receiptSummary:
      "You are turning on staking for this wallet, so its funds can be delegated to a pool.",
    audience: "admin",
    availabilityReason: "Available when the connected wallet can change settings.",
    setupCTA: "Choose who approves",
    routeExplanation:
      "This turns on staking by setting the wallet's stake address, so its funds can be delegated to a stake pool."
  },
  "update-state": {
    audience: "admin",
    availabilityReason: "Available when the connected wallet can change settings.",
    setupCTA: "Choose who approves",
    routeExplanation: "This updates people, the proof of life, and other wallet rules."
  },
  "manage-streaming-payments": {
    audience: "admin",
    availabilityReason: "Available when the connected wallet can change scheduled payments.",
    setupCTA: "Choose who approves",
    routeExplanation: "This adds or updates scheduled payments."
  },
  "consolidate-utxo": {
    audience: "expert",
    availabilityReason: "Available when the wallet has fund pools to merge or move.",
    setupCTA: "Load funds",
    routeExplanation: "This merges several fund pools into a simpler wallet balance."
  },
  "wallet-publish": {
    receiptSummary:
      "You are publishing a governance certificate from this wallet.",
    audience: "expert",
    availabilityReason: "Available when this wallet can approve governance actions.",
    setupCTA: "Finish setup",
    routeExplanation: "This publishes an advanced governance certificate."
  },
  "wallet-vote": {
    receiptSummary:
      "You are casting this wallet's vote on a governance action.",
    audience: "expert",
    availabilityReason: "Available when this wallet can approve governance actions.",
    setupCTA: "Finish setup",
    routeExplanation: "This casts an advanced governance vote."
  },
  "renew-proof-of-life": {
    receiptSummary:
      "You are checking in, which pushes the proof of life back. No money moves.",
    audience: "expert",
    availabilityReason: "Available when a user can refresh the proof of life.",
    setupCTA: "Finish setup",
    routeExplanation: "This refreshes the wallet proof of life."
  }
};

const BASE_USER_ACTION_DEFINITIONS: TaskDefinition[] = [
  {
    kind: "mint",
    label: i18n("createWallet"),
    shortLabel: "Create",
    description: i18n("createANewWallet"),
    outcome: i18n("createsTheWalletAndAddsItsFirstFunds"),
    whenToUse: "Start here when you need a new smart wallet.",
    whatChanges: i18n("createsTheWalletNameOwnersOptionalRecoveryContacts"),
    pathLabels: ["Owner"],
    surfaceLabel: "New wallet setup",
    startingPoint: "Check the name, owners, and starter funds before continuing.",
    buildLabel: "Preview create wallet",
    icon: ShieldPlus,
    prerequisites: ["wallet", "preprod"],
    lane: "recommended",
    group: "setup-funding",
    risk: "medium"
  },
  {
    kind: "lock-funds",
    label: i18n("addFunds"),
    shortLabel: "Add funds",
    description: i18n("getTheAddressOrAddMoney"),
    outcome: i18n("addsFundsToThisSmartWallet"),
    whenToUse:
      "Use this when someone needs to send assets into the wallet, or when you want to add funds yourself.",
    whatChanges: i18n("createsOneOrMoreFundPoolsAtThe"),
    pathLabels: ["Connected wallet"],
    surfaceLabel: "Receive + deposit",
    startingPoint:
      "Start by copying the receive address. Use the form only when you want to add funds from the connected wallet.",
    buildLabel: "Preview add funds",
    icon: WalletCards,
    prerequisites: ["wallet", "preprod", "locking-contract"],
    lane: "recommended",
    group: "setup-funding",
    risk: "low"
  },
  {
    kind: "use",
    label: i18n("sendFunds"),
    shortLabel: "Send",
    description: i18n("sendMoneyFromThisWallet"),
    outcome: i18n("sendsSelectedFundsToARecipientWhileKeeping"),
    whenToUse:
      "Use this for normal payments when you are allowed to send from the wallet.",
    whatChanges:
      i18n("theRecipientReceivesTheAssetsYouChoosePeople_d262cc"),
    pathLabels: ["Owner", "Co-signers"],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: "Open a wallet, choose Send, then pick the recipient and amount.",
    buildLabel: "Preview send",
    icon: HandCoins,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "recommended",
    group: "everyday-spending",
    risk: "medium"
  },
  {
    kind: "use-allowance",
    label: i18n("useAllowance"),
    shortLabel: "Allowance",
    description: i18n("sendWithinASpendingLimit"),
    outcome: i18n("sendsFundsWithinOneSpenderSDailyLimit"),
    whenToUse: "Use this when the connected wallet has a spending allowance.",
    whatChanges: i18n("theRecipientGetsPaidAndTheRemainingAllowance"),
    pathLabels: ["Spender"],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: "Open a wallet that lists the connected wallet as a spender.",
    buildLabel: "Preview allowance send",
    icon: BadgeCheck,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "recommended",
    group: "everyday-spending",
    risk: "low"
  },
  {
    kind: "use-beneficiary",
    label: i18n("useRecoveryContactAccess"),
    shortLabel: "Recovery contact",
    description: i18n("sendAfterRecoveryContactUnlock"),
    outcome: i18n("sendsFundsUsingTheWalletSRecoveryContact"),
    whenToUse:
      "Use this when the connected wallet is listed as a recovery contact and the wallet is unlocked.",
    whatChanges:
      i18n("theRecoveryContactReceivesFundsUpToThe"),
    pathLabels: ["Recovery contact"],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: "Open a wallet where the connected wallet is an active recovery contact.",
    buildLabel: "Preview recovery-contact send",
    icon: HandHeart,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "recommended",
    group: "everyday-spending",
    risk: "medium"
  },
  {
    kind: "payout-streaming-payment",
    label: i18n("payScheduledPayments"),
    shortLabel: "Pay",
    description: i18n("payWhatAScheduledPaymentOwes"),
    outcome: i18n("paysWhatOneOrMoreScheduledPaymentsOwe"),
    whenToUse: "Use this when a scheduled payment is due.",
    whatChanges: i18n("recipientsGetPaidAndTheWalletRecordsThe"),
    pathLabels: ["Schedule"],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: "Open a wallet with scheduled payments, then choose the due payments.",
    buildLabel: "Preview scheduled payment",
    icon: CalendarArrowDown,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "recommended",
    group: "everyday-spending",
    risk: "medium"
  },
  {
    kind: "wallet-withdraw",
    label: i18n("claimStakingRewards"),
    shortLabel: "Staking",
    description: i18n("collectAdaRewardsEarnedFromStaking"),
    outcome:
      i18n("collectsStakingRewardsWhileKeepingThisWalletS"),
    whenToUse:
      "Use this when this wallet should claim available staking rewards.",
    whatChanges:
      i18n("rewardsAreCollectedAndTheWalletStateIs"),
    pathLabels: ["Owner", "Co-signers"],
    surfaceLabel: "Staking rewards",
    startingPoint: "Open the wallet, then enter the staking address and reward amount.",
    buildLabel: "Preview rewards claim",
    icon: Coins,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "recommended",
    group: "wallet-operations",
    risk: "medium"
  },
  {
    kind: "set-intended-stake-credential",
    label: i18n("enableStaking"),
    shortLabel: "Enable staking",
    description: i18n("setTheWalletSStakeAddressSoIt"),
    outcome:
      i18n("turnsOnStakingByRecordingTheWalletS"),
    whenToUse:
      "Use this once to make a wallet stakeable, before delegating its funds to a pool.",
    whatChanges:
      i18n("theWalletSStakeAddressIsSetExisting"),
    pathLabels: ["Owner", "Co-signers"],
    surfaceLabel: "Staking rewards",
    startingPoint: "Open the wallet, then confirm enabling staking.",
    buildLabel: "Preview enable staking",
    icon: ShieldPlus,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "advanced",
    group: "wallet-operations",
    risk: "medium"
  },
  {
    kind: "update-state",
    label: i18n("updateWalletSettings"),
    shortLabel: "Settings",
    description: i18n("editPeopleRecoveryAndTheProofOfLife"),
    outcome: i18n("savesChangesToPeopleRecoveryContactsApprovalsOr"),
    whenToUse:
      "Use this when you want to change who can use the wallet or how the wallet is protected.",
    whatChanges:
      i18n("updatesWalletSettingsExistingFundsStayInThe"),
    pathLabels: ["Owner", "Co-signers"],
    surfaceLabel: "Wallet settings",
    startingPoint: "Open a wallet, choose the section you want to edit, then review the changes.",
    buildLabel: "Preview settings update",
    icon: Settings2,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "advanced",
    group: "state-management",
    risk: "high"
  },
  {
    kind: "manage-streaming-payments",
    label: i18n("manageScheduledPayments"),
    shortLabel: "Scheduled payments",
    description: i18n("addOrUpdateScheduledPayments"),
    outcome: i18n("savesTheSchedulePayingWhatItOwesIs"),
    whenToUse:
      "Use this when you need to add, renew, pause, or edit a scheduled payment.",
    whatChanges:
      i18n("changesOnlyTheScheduledPaymentsPeopleAndOther"),
    pathLabels: ["Owner", "Co-signers"],
    surfaceLabel: "Scheduled payments",
    startingPoint: "Open a wallet, then add or edit the scheduled payments.",
    buildLabel: "Preview scheduled payment changes",
    icon: Repeat,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "advanced",
    group: "state-management",
    risk: "high"
  },
  {
    kind: "consolidate-utxo",
    label: i18n("tidyWalletFunds"),
    shortLabel: "Tidy",
    description: i18n("mergeSmallFundPoolsIntoOneToSave"),
    // "UTxO", "stake-address" and "intended address" are the chain's words for something the
    // rest of the app already says plainly: the wallet-home notice calls this "Move it back".
    outcome: i18n("mergesTheWalletSFundPoolsOrMoves"),
    whenToUse:
      "Use this when the wallet holds several small fund pools, or one pool sitting at an old address.",
    whatChanges:
      i18n("fundsStayInTheWalletTheyEndUp"),
    pathLabels: ["Owner", "Co-signers", "Recovery contact"],
    surfaceLabel: "Wallet maintenance",
    startingPoint: "Open a wallet, then choose which fund pools should be merged.",
    buildLabel: "Preview tidy funds",
    icon: Combine,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract", "locked-utxos"],
    lane: "advanced",
    group: "state-management",
    risk: "medium"
  },
  {
    kind: "wallet-publish",
    label: i18n("publishCertificate"),
    shortLabel: "Publish",
    description: i18n("registerTheWalletForStakingOrGovernance"),
    outcome:
      i18n("sendsTheCertificateYouPasteToCardanoOn"),
    whenToUse:
      "Use this for advanced governance or stake certificate operations that should be authorized by the smart wallet.",
    whatChanges:
      i18n("publishesTheCertificateAndCarriesTheWalletState"),
    pathLabels: ["Owner", "Co-signers"],
    surfaceLabel: "Governance",
    startingPoint: "Open a wallet, then paste the certificate payload.",
    buildLabel: "Preview certificate",
    icon: FileText,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "advanced",
    group: "governance",
    risk: "high"
  },
  {
    kind: "wallet-vote",
    label: i18n("castVote"),
    shortLabel: "Vote",
    description: i18n("voteOnACardanoGovernanceProposal"),
    outcome:
      i18n("castsTheVoteYouPasteOnACardano"),
    whenToUse:
      "Use this for advanced governance votes that should be authorized by the smart wallet.",
    whatChanges:
      i18n("castsTheVoteAndCarriesTheWalletState"),
    pathLabels: ["Owner", "Co-signers"],
    surfaceLabel: "Governance",
    startingPoint: "Open a wallet, then paste the vote payload.",
    buildLabel: "Preview vote",
    icon: FileSignature,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "advanced",
    group: "governance",
    risk: "high"
  },
  {
    kind: "renew-proof-of-life",
    label: i18n("refreshProofOfLife"),
    shortLabel: "Refresh",
    description: i18n("keepRecoveryContactUnlockDelayed"),
    outcome: i18n("refreshesTheWalletProofOfLifeWithoutSending"),
    whenToUse:
      "Use this when someone needs to show the wallet is still in use.",
    whatChanges:
      i18n("movesTheProofOfLifeForwardWithinThe"),
    pathLabels: ["Allowed person"],
    surfaceLabel: "Proof of life",
    startingPoint: "Open a wallet, then review the new proof of life before confirming.",
    buildLabel: "Preview timer renewal",
    icon: Clock3,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference"],
    lane: "advanced",
    group: "manual",
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
