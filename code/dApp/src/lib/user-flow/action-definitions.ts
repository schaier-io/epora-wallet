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
  SendHorizontal,
  ShieldPlus,
  WalletCards
} from "lucide-react";
import {
  IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
  type TaskDefinition,
  type UserActionKind
} from "@/components/user/flow-types";

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
  "wallet-spend": {
    receiptSummary:
      "You are sending funds from one chosen fund pool, with the controls set by hand.",
    audience: "expert",
    availabilityReason: "Available for advanced manual recovery or testing flows.",
    setupCTA: "Use advanced tools",
    routeExplanation: "This is a manual advanced send flow."
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
    label: "Create wallet",
    shortLabel: "Create",
    description: "Create a new wallet.",
    outcome: "Creates the wallet and adds its first funds.",
    whenToUse: "Start here when you need a new smart wallet.",
    whatChanges: "Creates the wallet name, owners, optional recovery contacts, and first balance.",
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
    label: "Add funds",
    shortLabel: "Add funds",
    description: "Get the address or add money.",
    outcome: "Adds funds to this smart wallet.",
    whenToUse:
      "Use this when someone needs to send assets into the wallet, or when you want to add funds yourself.",
    whatChanges: "Creates one or more fund pools at the wallet address.",
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
    label: "Send funds",
    shortLabel: "Send",
    description: "Send money from this wallet.",
    outcome: "Sends selected funds to a recipient while keeping wallet rules unchanged.",
    whenToUse:
      "Use this for normal payments when you are allowed to send from the wallet.",
    whatChanges:
      "The recipient receives the assets you choose. People, scheduled payments, and the proof of life stay the same.",
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
    label: "Use allowance",
    shortLabel: "Allowance",
    description: "Send within a spending limit.",
    outcome: "Sends funds within one spender's daily limit.",
    whenToUse: "Use this when the connected wallet has a spending allowance.",
    whatChanges: "The recipient gets paid and the remaining allowance is updated.",
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
    label: "Use recovery-contact access",
    shortLabel: "Recovery contact",
    description: "Send after recovery-contact unlock.",
    outcome: "Sends funds using the wallet's recovery-contact rules.",
    whenToUse:
      "Use this when the connected wallet is listed as a recovery contact and the wallet is unlocked.",
    whatChanges:
      "The recovery contact receives funds up to the configured limits. The wallet rules stay unchanged.",
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
    label: "Pay scheduled payments",
    shortLabel: "Pay",
    description: "Pay what a scheduled payment owes.",
    outcome: "Pays what one or more scheduled payments owe, from this wallet.",
    whenToUse: "Use this when a scheduled payment is due.",
    whatChanges: "Recipients get paid and the wallet records the payment.",
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
    label: "Claim staking rewards",
    shortLabel: "Staking",
    description: "Collect ADA rewards earned from staking.",
    outcome:
      "Collects staking rewards while keeping this wallet's rules in sync.",
    whenToUse:
      "Use this when this wallet should claim available staking rewards.",
    whatChanges:
      "Rewards are collected and the wallet state is carried forward without changing everyday rules.",
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
    label: "Enable staking",
    shortLabel: "Enable staking",
    description: "Set the wallet's stake address so it can delegate.",
    outcome:
      "Turns on staking by recording the wallet's own staking script as its stake address.",
    whenToUse:
      "Use this once to make a wallet stakeable, before delegating its funds to a pool.",
    whatChanges:
      "The wallet's stake address is set; existing funds are then moved to the new staking address and can be delegated.",
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
    label: "Update wallet settings",
    shortLabel: "Settings",
    description: "Edit people, recovery, and the proof of life.",
    outcome: "Saves changes to people, recovery contacts, approvals, or the proof of life.",
    whenToUse:
      "Use this when you want to change who can use the wallet or how the wallet is protected.",
    whatChanges:
      "Updates wallet settings. Existing funds stay in the wallet unless you choose a send action separately.",
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
    label: "Manage scheduled payments",
    shortLabel: "Scheduled payments",
    description: "Add or update scheduled payments.",
    outcome: "Saves the schedule. Paying what it owes is a separate step.",
    whenToUse:
      "Use this when you need to add, renew, pause, or edit a scheduled payment.",
    whatChanges:
      "Changes only the scheduled payments. People and other wallet settings stay unchanged.",
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
    label: "Tidy wallet funds",
    shortLabel: "Tidy",
    description: "Merge small fund pools into one to save on fees.",
    // "UTxO", "stake-address" and "intended address" are the chain's words for something the
    // rest of the app already says plainly: the wallet-home notice calls this "Move it back".
    outcome: "Merges the wallet's fund pools, or moves one back to the wallet's main address.",
    whenToUse:
      "Use this when the wallet holds several small fund pools, or one pool sitting at an old address.",
    whatChanges:
      "Funds stay in the wallet. They end up in fewer pools, so later transactions cost less.",
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
    label: "Publish certificate",
    shortLabel: "Publish",
    description: "Register the wallet for staking or governance.",
    outcome:
      "Sends the certificate you paste to Cardano, on this wallet's behalf. The wallet's rules and people do not change.",
    whenToUse:
      "Use this for advanced governance or stake certificate operations that should be authorized by the smart wallet.",
    whatChanges:
      "Publishes the certificate and carries the wallet state forward.",
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
    label: "Cast vote",
    shortLabel: "Vote",
    description: "Vote on a Cardano governance proposal.",
    outcome:
      "Casts the vote you paste on a Cardano governance proposal, on this wallet's behalf. The wallet's rules and people do not change.",
    whenToUse:
      "Use this for advanced governance votes that should be authorized by the smart wallet.",
    whatChanges:
      "Casts the vote and carries the wallet state forward.",
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
    label: "Refresh proof of life",
    shortLabel: "Refresh",
    description: "Keep recovery-contact unlock delayed.",
    outcome: "Refreshes the wallet proof of life without sending funds.",
    whenToUse:
      "Use this when someone needs to show the wallet is still in use.",
    whatChanges:
      "Moves the proof of life forward within the allowed renewal window.",
    pathLabels: ["Allowed person"],
    surfaceLabel: "Proof of life",
    startingPoint: "Open a wallet, then review the new proof of life before confirming.",
    buildLabel: "Preview timer renewal",
    icon: Clock3,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference"],
    lane: "advanced",
    group: "manual",
    risk: "medium"
  },
  {
    kind: "wallet-spend",
    label: "Advanced manual send",
    shortLabel: "Manual",
    description: "Low-level send controls.",
    outcome: "Moves value out of one selected fund pool with manual controls.",
    whenToUse:
      "Use this only for recovery, testing, or cases the guided send flow cannot cover.",
    whatChanges:
      "Uses the exact manual output and approval data you provide.",
    pathLabels: ["Manual"],
    surfaceLabel: "Advanced manual send",
    startingPoint: "Use only when you need low-level control.",
    buildLabel: "Preview manual send",
    icon: SendHorizontal,
    prerequisites: ["wallet", "preprod", "locking-contract"],
    lane: "advanced",
    group: "manual",
    risk: "high"
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
