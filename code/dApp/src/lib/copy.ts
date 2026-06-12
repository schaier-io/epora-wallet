/**
 * Centralized plain-language wording.
 * Rule: no jargon at the surface. Cardano-specific terms stay in code/types only.
 */

export const COPY = {
  brand: {
    name: "Epora Wallet",
    nameShort: "Epora",
    nameDisplay: ["Epora", "Wallet"] as const,
    tagline: "Cardano smart wallet",
    legalNetwork: "Preprod test network. Funds and signatures stay on preprod, not Cardano mainnet."
  },
  asset: {
    nativeUnit: "ADA",
    nativeUnitInternal: "lovelace",
    nativeUnitDisplay: "ADA",
    other: "Token"
  },
  wallet: {
    singular: "wallet",
    plural: "wallets",
    pickerTitle: "Choose a wallet",
    pickerSubtitle: "Pick a wallet to open, or create a new one.",
    createNew: "Create new wallet",
    createNewHint: "Start a new wallet with this signer.",
    switchOrCreate: "Switch or create wallet",
    listSearchPlaceholder: "Search by wallet name or receipt code",
    advancedDetails: "Wallet details"
  },
  people: {
    owner: "Owner",
    owners: "Owners",
    ownerCount: (n: number) => `${n} ${n === 1 ? "owner" : "owners"}`,
    spending: "Spender",
    spenders: "Spenders",
    spendersHelp: "Can spend up to a daily limit you set.",
    recovery: "Recovery contact",
    recoveryPeople: "Recovery contacts",
    recoveryHelp: "Steps in to recover access if owners lose their keys.",
    signer: "Signer wallet",
    addOwner: "Add owner",
    addSpender: "Add spender",
    addBackup: "Add recovery contact",
    walletKey: "Wallet key",
    walletKeyHelp: "Keys allowed to act on behalf of this owner.",
    coSignRule: "Co-sign rule",
    coSignWeight: "Co-sign weight",
    coSignRuleNone: "None",
    coSignRuleSingle: "Single signer",
    coSignRuleMulti: "Multiple signers"
  },
  money: {
    funds: "Funds",
    fund: "Fund",
    fundsHelp: "How money is grouped inside this wallet.",
    fundingSource: "Fund pool",
    fundingSources: "Fund pools",
    lockedSources: "Selected fund pools",
    locked: "Locked",
    starterBalance: "Starter balance",
    addFunds: "Add money",
    sendFunds: "Send money",
    receiveFunds: "Receive money",
    deposit: "Deposit",
    depositAddress: "Deposit address",
    receiveAddress: "Wallet address",
    balance: "Balance",
    available: "available"
  },
  send: {
    title: "Send money",
    recipient: "Send to",
    recipientPlaceholder: "Cardano address or saved person",
    amount: "Amount",
    amountUnit: "ADA",
    addPayout: "Add another recipient",
    maxButton: "Max",
    asset: "What to send"
  },
  receive: {
    title: "Receive money",
    description: "Share this address or QR code to receive money.",
    shareAddress: "Share this address to receive money.",
    addFromConnected: "Move money from connected wallet"
  },
  timer: {
    title: "Wake-up timer",
    description: "If no owner signs for a while, recovery contacts can step in.",
    short: "Activity check",
    off: "Off",
    on: "On"
  },
  approvals: {
    title: "Multiple approvals",
    description: "Require more than one signer before sensitive actions go through.",
    off: "Single approver",
    on: "Needs more than one approver"
  },
  streamingPayments: {
    title: "Scheduled payments",
    description: "Send a set amount on a recurring schedule.",
    rule: "Schedule",
    rules: "Schedules",
    empty: "No scheduled payments yet.",
    emptyHint: "You can still send money manually any time.",
    add: "Add a schedule",
    manage: "Update schedules",
    pay: "Pay a schedule"
  },
  advanced: {
    label: "Advanced",
    proLabel: "Pro",
    claimRewards: "Claim staking rewards",
    claimRewardsHelp: "Collect ADA rewards earned from staking.",
    governance: "Voting & governance",
    governanceHelp: "Vote on Cardano governance and delegate your stake.",
    tidy: "Tidy funds",
    tidyHelp: "Merge small fund pools into one to save on fees."
  },
  review: {
    title: "Review",
    receiptTitle: "What will happen",
    nextStep: "Next step",
    confirming: "Waiting for signature…",
    showTechnical: "Show technical details",
    sizeCheck: "Transaction size",
    techRawTitle: "Raw transaction",
    techExecution: "Execution details"
  },
  setup: {
    pathTitle: "Setup steps",
    stepConnect: "Connect your signer",
    stepPeople: "Pick who can use it",
    stepConfirm: "Confirm and sign",
    walletName: "Wallet name",
    walletNameHint: "A label you'll see in the wallet list.",
    walletRules: "Wallet rules",
    walletRulesHint: "Choose what this wallet is allowed to do.",
    whoManages: "Who can manage this wallet",
    whoManagesHint: "Owners can change everything. Spenders can only spend up to their daily limit.",
    starterBalanceHint: "Place this amount into the wallet when it's created.",
    createCta: "Create wallet"
  },
  status: {
    ready: "Ready",
    refreshing: "Refreshing",
    connecting: "Connecting…",
    connected: "Connected",
    disconnected: "Not connected"
  },
  errors: {
    blocked: "Something needs your attention",
    fixFields: "Please fix these fields",
    showAll: "Show all"
  },
  receipt: {
    code: "Receipt code",
    codeHelp: "A unique code for this wallet's first transaction."
  }
} as const;

/**
 * Internal/Cardano terms kept for code. Use these constants when interacting
 * with the SDK so swaps remain mechanical.
 */
export const INTERNAL = {
  lovelaceUnit: "lovelace"
} as const;
