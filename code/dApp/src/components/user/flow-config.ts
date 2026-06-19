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
  type ReadinessIssue,
  type SetupState,
  type TaskDefinition,
  type UserActionKind
} from "@/components/user/flow-types";

type TaskUxMetadata = Pick<
  TaskDefinition,
  "audience" | "availabilityReason" | "setupCTA" | "routeExplanation"
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
    availabilityReason: "Available when the selected wallet has streaming payments ready to pay.",
    setupCTA: "Load streaming payments",
    routeExplanation: "This pays scheduled recipients and records that they were paid."
  },
  "wallet-withdraw": {
    audience: "expert",
    availabilityReason: "Available when this wallet can approve staking actions.",
    setupCTA: "Finish setup",
    routeExplanation: "This collects staking rewards for this wallet."
  },
  "set-intended-stake-credential": {
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
    routeExplanation: "This updates people, safety settings, and wallet rules."
  },
  "manage-streaming-payments": {
    audience: "admin",
    availabilityReason: "Available when the connected wallet can change streaming payments.",
    setupCTA: "Choose who approves",
    routeExplanation: "This adds or updates scheduled payments."
  },
  "consolidate-utxo": {
    audience: "expert",
    availabilityReason: "Available when the wallet has several funding sources that can be merged.",
    setupCTA: "Load funds",
    routeExplanation: "This tidies several funding sources into a simpler wallet balance."
  },
  "wallet-publish": {
    audience: "expert",
    availabilityReason: "Available when this wallet can approve governance actions.",
    setupCTA: "Finish setup",
    routeExplanation: "This publishes an advanced governance certificate."
  },
  "wallet-propose": {
    audience: "expert",
    availabilityReason: "Available when this wallet can approve governance actions.",
    setupCTA: "Finish setup",
    routeExplanation: "This submits an advanced governance proposal."
  },
  "wallet-spend": {
    audience: "expert",
    availabilityReason: "Available for advanced manual recovery or testing flows.",
    setupCTA: "Use advanced tools",
    routeExplanation: "This is a manual advanced send flow."
  },
  "renew-proof-of-life": {
    audience: "expert",
    availabilityReason: "Available when a user can refresh the wake-up timer.",
    setupCTA: "Finish setup",
    routeExplanation: "This refreshes the wallet wake-up timer."
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
    whatChanges: "Creates one or more wallet funding entries at the wallet address.",
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
      "The recipient receives the assets you choose. People, streamingPayments, and safety settings stay the same.",
    pathLabels: ["Owner", "Group approval"],
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
    outcome: "Sends funds within one user's allowance.",
    whenToUse: "Use this when the connected wallet has a spending allowance.",
    whatChanges: "The recipient gets paid and the remaining allowance is updated.",
    pathLabels: ["User"],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: "Open a wallet that recognizes the connected wallet as an allowance user.",
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
    label: "Pay streaming payments",
    shortLabel: "Pay",
    description: "Pay scheduled recipients.",
    outcome: "Pays one or more scheduled recipients from this wallet.",
    whenToUse: "Use this when a streaming payment is due.",
    whatChanges: "Recipients get paid and the wallet records the payment.",
    pathLabels: ["Schedule"],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: "Open a wallet with streaming payments, then choose the due payments.",
    buildLabel: "Preview streaming payment",
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
    description: "Collect staking rewards.",
    outcome:
      "Collects staking rewards while keeping this wallet's rules in sync.",
    whenToUse:
      "Use this when this wallet should claim available staking rewards.",
    whatChanges:
      "Rewards are collected and the wallet state is carried forward without changing everyday rules.",
    pathLabels: ["Owner", "Group approval"],
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
    pathLabels: ["Owner", "Group approval"],
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
    description: "Edit people and safety rules.",
    outcome: "Saves changes to people, recovery contacts, approval rules, or safety settings.",
    whenToUse:
      "Use this when you want to change who can use the wallet or how the wallet is protected.",
    whatChanges:
      "Updates wallet settings. Existing funds stay in the wallet unless you choose a send action separately.",
    pathLabels: ["Owner", "Group approval"],
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
    label: "Manage streaming payments",
    shortLabel: "Streaming payments",
    description: "Add or update scheduled payments.",
    outcome: "Saves streaming payment rules for future scheduled payments.",
    whenToUse:
      "Use this when you need to add, renew, pause, or edit scheduled recipients.",
    whatChanges:
      "Updates only streaming payment rules. People and other wallet settings stay unchanged.",
    pathLabels: ["Owner", "Group approval"],
    surfaceLabel: "Streaming payments",
    startingPoint: "Open a wallet, then add or edit the scheduled payments.",
    buildLabel: "Preview streaming payment changes",
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
    description: "Merge small funding sources.",
    outcome: "Turns several small funding sources into a simpler wallet balance.",
    whenToUse:
      "Use this when the wallet has too many small funding sources and later actions feel heavy.",
    whatChanges:
      "Funds stay in the wallet, but the internal funding layout becomes simpler.",
    pathLabels: ["Owner", "Group approval", "Recovery contact"],
    surfaceLabel: "Wallet maintenance",
    startingPoint: "Open a wallet, then choose which funding sources should be merged.",
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
    description: "Advanced governance action.",
    outcome: "Attach an advanced certificate action to the permission-wallet admin path.",
    whenToUse:
      "Use this for advanced governance or stake certificate operations that should be authorized by the smart wallet.",
    whatChanges:
      "Publishes the certificate and carries the wallet state forward.",
    pathLabels: ["Owner", "Group approval"],
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
    kind: "wallet-propose",
    label: "Submit proposal",
    shortLabel: "Propose",
    description: "Advanced governance action.",
    outcome: "Attach an advanced proposal procedure to the permission-wallet admin path.",
    whenToUse:
      "Use this for advanced governance proposal submissions that should be authorized by the smart wallet.",
    whatChanges:
      "Submits the proposal and carries the wallet state forward.",
    pathLabels: ["Owner", "Group approval"],
    surfaceLabel: "Governance",
    startingPoint: "Open a wallet, then paste the proposal payload.",
    buildLabel: "Preview proposal",
    icon: FileSignature,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "advanced",
    group: "governance",
    risk: "high"
  },
  {
    kind: "renew-proof-of-life",
    label: "Refresh wake-up timer",
    shortLabel: "Refresh",
    description: "Keep recovery-contact unlock delayed.",
    outcome: "Refreshes the wallet wake-up timer without sending funds.",
    whenToUse:
      "Use this when an allowed user needs to show the wallet is still actively managed.",
    whatChanges:
      "Moves the wake-up timer forward within the allowed renewal window.",
    pathLabels: ["Eligible user"],
    surfaceLabel: "Wake-up timer",
    startingPoint: "Open a wallet, then review the new wake-up timer before confirming.",
    buildLabel: "Preview safety refresh",
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
    outcome: "Moves value out of one selected wallet funding source with manual controls.",
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

export function buildSetupReadinessIssues(setupState: SetupState): ReadinessIssue[] {
  const walletIssue: ReadinessIssue = setupState.walletName
    ? {
        id: "wallet",
        key: "wallet",
        label: "Connected wallet",
        description: `Connected to ${setupState.walletName}.`,
        status: "ready",
        blocking: false
      }
    : {
        id: "wallet",
        key: "wallet",
        label: "Connected wallet",
        description: "Connect your browser wallet first.",
        status: "error",
        blocking: true
      };

  const preprodIssue: ReadinessIssue =
    setupState.networkId === null
      ? {
          id: "preprod",
          key: "preprod",
          label: "Test network",
          description: "Network will be checked once a wallet is connected.",
          status: "warning",
          blocking: true
        }
      : setupState.networkId === 0
        ? {
            id: "preprod",
            key: "preprod",
            label: "Test network",
            description: "The connected wallet is on Preprod.",
            status: "ready",
            blocking: false
          }
        : {
            id: "preprod",
            key: "preprod",
            label: "Test network",
            description: "Switch the connected wallet to Preprod.",
            status: "error",
            blocking: true
          };

  const detectedTokenIssue: ReadinessIssue = setupState.hasDetectedToken
    ? {
        id: "detected-token",
        key: "detected-token",
        label: "Wallet opened",
        description: "This smart wallet is open and ready.",
        status: "ready",
        blocking: false
      }
    : {
        id: "detected-token",
        key: "detected-token",
        label: "Wallet opened",
        description:
          "Choose a detected smart wallet before using this action.",
        status: "warning",
        blocking: true
      };

  const sttReferenceIssue: ReadinessIssue =
    setupState.sharedSttReferenceStatus === "loading"
      ? {
          id: "stt-reference",
          key: "stt-reference",
          label: "Setup helper",
          description: "Checking wallet setup now.",
          status: "warning",
          blocking: true
        }
      : setupState.sharedSttReferenceStatus === "ready"
        ? {
            id: "stt-reference",
            key: "stt-reference",
            label: "Setup helper",
            description: "The shared setup helper is ready.",
            status: "ready",
            blocking: false
          }
      : {
          id: "stt-reference",
          key: "stt-reference",
          label: "Setup helper",
          description:
            setupState.sharedSttReferenceError ??
            "Create the shared setup helper before continuing.",
          status: "warning",
          blocking: true
        };

  const lockingContractIssue: ReadinessIssue = setupState.lockingContractAddress
    ? {
        id: "locking-contract",
        key: "locking-contract",
        label: "Receive address ready",
        description: "The wallet receive address is ready.",
        status: "ready",
        blocking: false
      }
    : {
        id: "locking-contract",
        key: "locking-contract",
        label: "Receive address ready",
        description:
          setupState.lockingContractError ??
          "Open a wallet before using its receive address.",
        status: "error",
        blocking: true
      };

  const lockedUtxoIssue: ReadinessIssue = setupState.lockedUtxosLoading
    ? {
        id: "locked-utxos",
        key: "locked-utxos",
        label: "Funds loaded",
        description: "Refreshing wallet funds now.",
        status: "warning",
        blocking: true
      }
    : setupState.lockingContractAddress && setupState.lockedUtxoCount > 0
      ? {
          id: "locked-utxos",
          key: "locked-utxos",
          label: "Funds loaded",
          description: `${setupState.lockedUtxoCount} funding source(s) found.`,
          status: "ready",
          blocking: false
        }
      : {
          id: "locked-utxos",
          key: "locked-utxos",
          label: "Funds loaded",
          description:
            "No wallet funds are loaded yet. Refresh after receiving funds or choose another action.",
          status: "warning",
          blocking: true
        };

  return [
    walletIssue,
    preprodIssue,
    detectedTokenIssue,
    sttReferenceIssue,
    lockingContractIssue,
    lockedUtxoIssue
  ];
}
