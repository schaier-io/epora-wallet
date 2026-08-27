
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibCopy.json";

const i18n = createDefaultTranslator("LibCopy", defaultMessages);/**
 * Centralized plain-language wording.
 * Rule: no jargon at the surface. Cardano-specific terms stay in code/types only.
 */

export const COPY = {
  brand: {
    name: i18n("eporaWallet"),
    nameShort: i18n("epora"),
    nameDisplay: [i18n("epora"), i18n("walletDisplay")] as const,
    tagline: i18n("sharedCardanoWallet"),
    legalNetwork: i18n("preprodOnlyNothingHereReachesCardanoMainnet")
  },
  asset: {
    nativeUnit: i18n("ada"),
    nativeUnitInternal: "lovelace",
    nativeUnitDisplay: i18n("ada"),
    other: i18n("token")
  },
  wallet: {
    singular: i18n("wallet"),
    plural: i18n("wallets"),
    pickerTitle: i18n("chooseAWallet"),
    pickerSubtitle: i18n("pickAWalletToOpenOrCreateA"),
    createNew: i18n("createNewWallet"),
    createNewHint: i18n("startANewWalletWithThisSigner"),
    switchOrCreate: i18n("switchOrCreateWallet"),
    listSearchPlaceholder: i18n("searchByWalletNameOrId"),
    advancedDetails: i18n("walletDetails")
  },
  people: {
    owner: i18n("owner"),
    owners: i18n("owners"),
    ownerCount: (n: number) => i18n("ownerCount", { count: n }),
    spending: i18n("spender"),
    spenders: i18n("spenders"),
    spendersHelp: i18n("canSpendUpToADailyLimitYou"),
    recovery: i18n("recoveryContact"),
    recoveryPeople: i18n("recoveryContacts"),
    recoveryHelp: i18n("canWithdrawAConfiguredShareAfterTheWake"),
    signer: i18n("signerWallet"),
    addOwner: i18n("addOwner"),
    addSpender: i18n("addSpender"),
    addBackup: i18n("addRecoveryContact"),
    walletKey: i18n("signerKey"),
    walletKeyHelp: i18n("signerKeysLinkedToThisOwner"),
    coSignRule: i18n("approvalRule"),
    coSignWeight: i18n("approvalWeight"),
    coSignRuleNone: i18n("none"),
    coSignRuleSingle: i18n("singleSigner"),
    coSignRuleMulti: i18n("multipleSigners")
  },
  money: {
    funds: i18n("funds"),
    fund: i18n("fund"),
    fundsHelp: i18n("howMoneyIsGroupedInsideThisWallet"),
    fundingSource: i18n("fundPool"),
    fundingSources: i18n("fundPools"),
    lockedSources: i18n("selectedFundPools"),
    locked: i18n("locked"),
    starterBalance: i18n("starterBalance"),
    addFunds: i18n("addFunds"),
    sendFunds: i18n("sendFunds"),
    receiveFunds: i18n("receiveFunds"),
    deposit: i18n("deposit"),
    depositAddress: i18n("depositAddress"),
    receiveAddress: i18n("walletAddress"),
    balance: i18n("balance"),
    available: i18n("available")
  },
  send: {
    title: i18n("sendFunds"),
    recipient: i18n("sendTo"),
    recipientPlaceholder: i18n("cardanoAddressOrSavedPerson"),
    amount: i18n("amount"),
    amountUnit: i18n("ada"),
    addPayout: i18n("addAnotherRecipient"),
    maxButton: i18n("max"),
    asset: i18n("whatToSend")
  },
  receive: {
    title: i18n("receiveFunds"),
    description: i18n("shareThisAddressOrQrCodeToReceive"),
    shareAddress: i18n("shareThisAddressToReceiveFunds"),
    addFromConnected: i18n("addFromConnectedWallet")
  },
  timer: {
    title: i18n("wakeUpTimer"),
    description:
      i18n("afterTheTimerExpiresRecoveryContactsCanWithdraw"),
    short: i18n("activityCheck"),
    off: i18n("off"),
    on: i18n("on")
  },
  approvals: {
    title: i18n("multipleApprovals"),
    description: i18n("requireMoreThanOneSignerBeforeSensitiveActions"),
    off: i18n("singleApprover"),
    on: i18n("needsMoreThanOneApprover")
  },
  streamingPayments: {
    title: i18n("scheduledPayments"),
    description:
      i18n("accrueASetAmountOnARecurringSchedule"),
    rule: i18n("schedule"),
    rules: i18n("schedules"),
    empty: i18n("noScheduledPaymentsYet"),
    emptyHint: i18n("youCanStillSendFundsWheneverYouNeed"),
    add: i18n("addASchedule"),
    manage: i18n("updateSchedules"),
    pay: i18n("payASchedule")
  },
  advanced: {
    label: i18n("advanced"),
    proLabel: i18n("pro"),
    claimRewards: i18n("claimStakingRewards"),
    claimRewardsHelp: i18n("collectAdaRewardsEarnedFromStaking"),
    governance: i18n("votingGovernance"),
    governanceHelp: i18n("voteOnCardanoGovernanceAndDelegateYourStake"),
    tidy: i18n("tidyFunds"),
    tidyHelp: i18n("mergeSmallFundPoolsIntoOneToSave")
  },
  review: {
    title: i18n("review"),
    receiptTitle: i18n("whatWillHappen"),
    nextStep: i18n("nextStep"),
    confirming: i18n("waitingForSignature"),
    showTechnical: i18n("showTechnicalDetails"),
    sizeCheck: i18n("transactionSize"),
    techRawTitle: i18n("rawTransaction"),
    techExecution: i18n("executionDetails")
  },
  setup: {
    pathTitle: i18n("setupSteps"),
    stepConnect: i18n("connectYourSigner"),
    stepPeople: i18n("pickWhoCanUseIt"),
    stepConfirm: i18n("confirmAndSign"),
    walletName: i18n("walletName"),
    walletNameHint: i18n("aLabelYouLlSeeInTheWallet"),
    walletRules: i18n("walletRules"),
    walletRulesHint: i18n("chooseWhatThisWalletIsAllowedToDo"),
    whoManages: i18n("whoCanManageThisWallet"),
    whoManagesHint: i18n("ownersManageTheWalletSpendersSendOnlyWithin"),
    starterBalanceHint: i18n("placeThisAmountIntoTheWalletWhenIt"),
    createCta: i18n("createWallet")
  },
  status: {
    ready: i18n("ready"),
    refreshing: i18n("refreshing"),
    connecting: i18n("connecting"),
    connected: i18n("connected"),
    disconnected: i18n("notConnected")
  },
  errors: {
    blocked: i18n("actionNotReady"),
    fixFields: i18n("fixTheseFields"),
    showAll: i18n("showAll")
  }
} as const;

/**
 * Internal/Cardano terms kept for code. Use these constants when interacting
 * with the SDK so swaps remain mechanical.
 */
export const INTERNAL = {
  lovelaceUnit: "lovelace"
} as const;
