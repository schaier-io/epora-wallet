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
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibUserFlowActionDefinitions.json";

const i18n = createDefaultTranslator("LibUserFlowActionDefinitions", defaultMessages);

// Static catalog of every guided user action: what it does, who it's for, and
// which prerequisites gate it. Pure data (icon fields hold component
// references, never JSX) — rendering lives in the workspace views, and the
// setup-readiness derivation lives in ./setup-readiness.ts.

type TaskUxMetadata = Pick<
  TaskDefinition,
  "audience" | "availabilityReason" | "setupCTA" | "routeExplanation"
>;

const USER_ACTION_UX_METADATA: Record<UserActionKind, TaskUxMetadata> = {
  mint: {
    audience: "admin",
    availabilityReason: i18n("availableAfterConnectingAPreprodWallet"),
    setupCTA: i18n("connectWallet"),
    routeExplanation: i18n("setUpASmartWalletAndAddIts")
  },
  "lock-funds": {
    audience: "everyday",
    availabilityReason: i18n("availableOnceTheWalletReceiveAddressIsReady"),
    setupCTA: i18n("prepareReceiveAddress"),
    routeExplanation:
      i18n("copyTheReceiveAddressOrAddFundsFrom")
  },
  use: {
    audience: "everyday",
    availabilityReason: i18n("availableWhenTheConnectedWalletIsAllowedTo"),
    setupCTA: i18n("finishSetup"),
    routeExplanation: i18n("chooseARecipientAndSendFromThisWallet")
  },
  "use-allowance": {
    audience: "everyday",
    availabilityReason: i18n("availableWhenThisWalletCanSpendFromA"),
    setupCTA: i18n("chooseMatchingWallet"),
    routeExplanation: i18n("sendWithinTheDailyLimitSavedForThis")
  },
  "use-beneficiary": {
    audience: "everyday",
    availabilityReason: i18n("availableWhenThisSignerIsARecoveryContact"),
    setupCTA: i18n("chooseRecoveryContactWallet"),
    routeExplanation:
      i18n("withdrawThisContactSConfiguredShareOnceThe")
  },
  "payout-streaming-payment": {
    audience: "everyday",
    availabilityReason: i18n("availableWhenTheSelectedWalletHasScheduledPayments"),
    setupCTA: i18n("loadScheduledPayments"),
    routeExplanation: i18n("payAmountsNowDueAndUpdateEachSchedule")
  },
  "wallet-withdraw": {
    audience: "expert",
    availabilityReason: i18n("availableWhenThisWalletCanApproveStakingActions"),
    setupCTA: i18n("finishSetup"),
    routeExplanation: i18n("collectAvailableStakingRewardsForThisWallet")
  },
  "set-intended-stake-credential": {
    audience: "admin",
    availabilityReason: i18n("availableWhenTheConnectedWalletCanChangeSettings"),
    setupCTA: i18n("chooseWhoApproves"),
    routeExplanation:
      i18n("setTheWalletSStakeAddressSoIts")
  },
  "update-state": {
    audience: "admin",
    availabilityReason: i18n("availableWhenTheConnectedWalletCanChangeSettings"),
    setupCTA: i18n("chooseWhoApproves"),
    routeExplanation: i18n("changePeopleRecoverySettingsOrApprovalRules")
  },
  "manage-streaming-payments": {
    audience: "admin",
    availabilityReason: i18n("availableWhenTheConnectedWalletCanChangeScheduled"),
    setupCTA: i18n("chooseWhoApproves"),
    routeExplanation: i18n("addStopOrUpdateScheduledPayments")
  },
  "consolidate-utxo": {
    audience: "expert",
    availabilityReason: i18n("availableWhenWalletFundsCanBeMergedOr"),
    setupCTA: i18n("loadFunds"),
    routeExplanation: i18n("mergeWalletFundPoolsOrMoveThemTo")
  },
  "wallet-publish": {
    audience: "expert",
    availabilityReason: i18n("availableWhenThisWalletCanApproveGovernanceActions"),
    setupCTA: i18n("finishSetup"),
    routeExplanation: i18n("publishAGovernanceOrStakeCertificateThroughThis")
  },
  "wallet-vote": {
    audience: "expert",
    availabilityReason: i18n("availableWhenThisWalletCanApproveGovernanceActions"),
    setupCTA: i18n("finishSetup"),
    routeExplanation: i18n("castAGovernanceVoteThroughThisWallet")
  },
  "wallet-spend": {
    audience: "expert",
    availabilityReason: i18n("availableForAdvancedManualRecoveryOrTestingFlows"),
    setupCTA: i18n("useAdvancedTools"),
    routeExplanation: i18n("buildAManualSendFromOneExactWallet")
  },
  "renew-proof-of-life": {
    audience: "expert",
    availabilityReason: i18n("availableWhenAUserCanRefreshTheWake"),
    setupCTA: i18n("finishSetup"),
    routeExplanation: i18n("pushTheWalletSRecoveryDateForwardWithout")
  }
};

const BASE_USER_ACTION_DEFINITIONS: TaskDefinition[] = [
  {
    kind: "mint",
    label: i18n("createWallet"),
    shortLabel: i18n("create"),
    description: i18n("buildASharedWalletFromTheGroundUp"),
    outcome: i18n("aNewSmartWalletOpensWithItsChosen"),
    whenToUse: i18n("forAWalletThatDoesNotExistYet"),
    whatChanges: i18n("oneTransactionCreatesTheWalletAndLocksIts"),
    pathLabels: [i18n("owner")],
    surfaceLabel: i18n("newWalletSetup"),
    startingPoint: i18n("nameItChooseItsPeopleThenDecideWhat"),
    buildLabel: i18n("previewCreateWallet"),
    icon: ShieldPlus,
    prerequisites: ["wallet", "preprod"],
    lane: "recommended",
    group: "setup-funding",
    risk: "medium"
  },
  {
    kind: "lock-funds",
    label: i18n("addFunds"),
    shortLabel: i18n("addFunds"),
    description: i18n("copyTheReceiveAddressOrFundTheWallet"),
    outcome: i18n("newAdaOrNativeAssetsArriveUnderThis"),
    whenToUse: i18n("whenThisWalletNeedsATopUpOr"),
    whatChanges: i18n("theBalanceIncreasesPeopleAndWalletRulesDo"),
    pathLabels: [i18n("connectedWallet")],
    surfaceLabel: i18n("receiveDeposit"),
    startingPoint:
      i18n("copyTheAddressForAnOutsideTransferOr"),
    buildLabel: i18n("previewAddFunds"),
    icon: WalletCards,
    prerequisites: ["wallet", "preprod", "locking-contract"],
    lane: "recommended",
    group: "setup-funding",
    risk: "low"
  },
  {
    kind: "use",
    label: i18n("sendFunds"),
    shortLabel: i18n("send"),
    description: i18n("paySomeoneFromTheSharedBalance"),
    outcome: i18n("theRecipientGetsTheSelectedAdaOrNative"),
    whenToUse: i18n("forAnOrdinaryPaymentApprovedByAnOwner"),
    whatChanges:
      i18n("theRecipientReceivesTheAssetsYouChoosePeople"),
    pathLabels: [i18n("owner"), i18n("requiredApprovals")],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: i18n("chooseTheRecipientAmountAndFundPoolsTo"),
    buildLabel: i18n("previewSend"),
    icon: HandCoins,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "recommended",
    group: "everyday-spending",
    risk: "medium"
  },
  {
    kind: "use-allowance",
    label: i18n("useAllowance"),
    shortLabel: i18n("allowance"),
    description: i18n("sendAgainstYourSavedDailyLimit"),
    outcome: i18n("theRecipientGetsPaidWithoutAnOwnerApproving"),
    whenToUse: i18n("whenTheConnectedSignerIsLinkedToA"),
    whatChanges: i18n("thePaymentLeavesTheWalletAndReducesThat"),
    pathLabels: [i18n("spender")],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: i18n("connectTheSpenderSSignerThenChooseA"),
    buildLabel: i18n("previewAllowanceSend"),
    icon: BadgeCheck,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "recommended",
    group: "everyday-spending",
    risk: "low"
  },
  {
    kind: "use-beneficiary",
    label: i18n("withdrawRecoveryShare"),
    shortLabel: i18n("recoveryWithdrawal"),
    description: i18n("claimARecoveryContactSOneTimeShare"),
    outcome: i18n("theContactReceivesUpToTheirConfiguredShare"),
    whenToUse:
      i18n("onlyAfterTheWakeUpTimerAndThis"),
    whatChanges:
      i18n("theRecoveryContactReceivesUpToTheirConfigured"),
    pathLabels: [i18n("recoveryContact")],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: i18n("connectTheRecoveryContactSSignerThenReview"),
    buildLabel: i18n("previewRecoveryWithdrawal"),
    icon: HandHeart,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "recommended",
    group: "everyday-spending",
    risk: "medium"
  },
  {
    kind: "payout-streaming-payment",
    label: i18n("payScheduledPayments"),
    shortLabel: i18n("pay"),
    description: i18n("releaseAmountsThatHaveAccruedOnASchedule"),
    outcome: i18n("oneOrMoreScheduledRecipientsReceiveTheAmounts"),
    whenToUse: i18n("whenAScheduleHasAnUnpaidAmountDue"),
    whatChanges: i18n("theWalletRecordsEachPayoutSoTheSame"),
    pathLabels: [i18n("scheduledPaymentRule")],
    surfaceLabel: IMPLICIT_LOCKED_INPUT_SURFACE_LABEL,
    startingPoint: i18n("chooseTheDueSchedulesAndConfirmHowMuch"),
    buildLabel: i18n("previewScheduledPayments"),
    icon: CalendarArrowDown,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "recommended",
    group: "everyday-spending",
    risk: "medium"
  },
  {
    kind: "wallet-withdraw",
    label: i18n("claimStakingRewards"),
    shortLabel: i18n("staking"),
    description: i18n("moveEarnedStakingRewardsIntoTheWallet"),
    outcome: i18n("availableRewardsAreCollectedForThisSmartWallet"),
    whenToUse: i18n("whenTheStakingAddressHasRewardsReadyTo"),
    whatChanges:
      i18n("rewardsMoveIntoTheWalletPeopleLimitsAnd"),
    pathLabels: [i18n("owner"), i18n("requiredApprovals")],
    surfaceLabel: i18n("stakingRewards"),
    startingPoint: i18n("enterTheStakingAddressAndTheRewardAmount"),
    buildLabel: i18n("previewRewardsClaim"),
    icon: Coins,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "recommended",
    group: "wallet-operations",
    risk: "medium"
  },
  {
    kind: "set-intended-stake-credential",
    label: i18n("enableStaking"),
    shortLabel: i18n("enableStaking"),
    description: i18n("giveThisWalletAStakeAddress"),
    outcome:
      i18n("turnsOnStakingByRecordingTheWalletS"),
    whenToUse:
      i18n("aOneTimeStepBeforeDelegatingTheWallet"),
    whatChanges:
      i18n("theWalletRecordsItsStakeAddressExistingFunds"),
    pathLabels: [i18n("owner"), i18n("requiredApprovals")],
    surfaceLabel: i18n("stakingRewards"),
    startingPoint: i18n("reviewTheNewStakingAddressBeforeApprovingThe"),
    buildLabel: i18n("previewEnableStaking"),
    icon: ShieldPlus,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "advanced",
    group: "wallet-operations",
    risk: "medium"
  },
  {
    kind: "update-state",
    label: i18n("updateWalletSettings"),
    shortLabel: i18n("settings"),
    description: i18n("changeWhoCanActAndWhichSafeguardsApply"),
    outcome: i18n("newPeopleRecoverySettingsOrApprovalRulesReplace"),
    whenToUse: i18n("whenAccessLimitsApprovalsOrRecoveryPlansNeed"),
    whatChanges:
      i18n("updatesWalletSettingsExistingFundsStayInThe"),
    pathLabels: [i18n("owner"), i18n("requiredApprovals")],
    surfaceLabel: i18n("walletSettings"),
    startingPoint: i18n("choosePeopleOrWalletSettingsThenMakeOne"),
    buildLabel: i18n("previewSettingsUpdate"),
    icon: Settings2,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "advanced",
    group: "state-management",
    risk: "high"
  },
  {
    kind: "manage-streaming-payments",
    label: i18n("manageScheduledPayments"),
    shortLabel: i18n("scheduledPayments"),
    description: i18n("createExtendOrStopPaymentSchedules"),
    outcome: i18n("theRevisedSchedulesBeginAccruingUnderTheirSaved"),
    whenToUse: i18n("whenARecurringRecipientAmountAssetOrEnd"),
    whatChanges:
      i18n("updatesOnlyScheduledPaymentRulesPeopleAndOther"),
    pathLabels: [i18n("owner"), i18n("requiredApprovals")],
    surfaceLabel: i18n("scheduledPayments"),
    startingPoint: i18n("pickAScheduleToEditOrAddA"),
    buildLabel: i18n("previewScheduledPaymentChanges"),
    icon: Repeat,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "advanced",
    group: "state-management",
    risk: "high"
  },
  {
    kind: "consolidate-utxo",
    label: i18n("tidyWalletFunds"),
    shortLabel: i18n("tidy"),
    description: i18n("combineScatteredWalletFunds"),
    outcome: i18n("combinesWalletFundPoolsOrMovesFundsFrom"),
    whenToUse:
      i18n("whenTooManySmallFundPoolsAddCost"),
    whatChanges:
      i18n("fundsStayInTheWalletButAreCombined"),
    pathLabels: [i18n("owner"), i18n("requiredApprovals"), i18n("recoveryContact")],
    surfaceLabel: i18n("walletMaintenance"),
    startingPoint: i18n("selectAtLeastTwoFundPoolsToCombine"),
    buildLabel: i18n("previewTidyFunds"),
    icon: Combine,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract", "locked-utxos"],
    lane: "advanced",
    group: "state-management",
    risk: "medium"
  },
  {
    kind: "wallet-publish",
    label: i18n("publishCertificate"),
    shortLabel: i18n("publish"),
    description: i18n("publishAGovernanceOrStakeCertificate"),
    outcome: i18n("theWalletAuthorizesAndPublishesTheCertificateYou"),
    whenToUse:
      i18n("forExperiencedUsersWithCertificateJsonPreparedBy"),
    whatChanges:
      i18n("publishesTheCertificatePeopleLimitsAndPaymentRules"),
    pathLabels: [i18n("owner"), i18n("requiredApprovals")],
    surfaceLabel: i18n("governance"),
    startingPoint: i18n("pasteTheCertificateJsonAndVerifyItBefore"),
    buildLabel: i18n("previewCertificate"),
    icon: FileText,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "advanced",
    group: "governance",
    risk: "high"
  },
  {
    kind: "wallet-vote",
    label: i18n("castVote"),
    shortLabel: i18n("vote"),
    description: i18n("castACardanoGovernanceVote"),
    outcome: i18n("theWalletAuthorizesAndSubmitsTheVoteYou"),
    whenToUse:
      i18n("forExperiencedUsersWithVoteJsonPreparedBy"),
    whatChanges:
      i18n("submitsTheVotePeopleLimitsAndPaymentRules"),
    pathLabels: [i18n("owner"), i18n("requiredApprovals")],
    surfaceLabel: i18n("governance"),
    startingPoint: i18n("pasteTheVoteJsonAndVerifyItBefore"),
    buildLabel: i18n("previewVote"),
    icon: FileSignature,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference", "locking-contract"],
    lane: "advanced",
    group: "governance",
    risk: "high"
  },
  {
    kind: "renew-proof-of-life",
    label: i18n("refreshWakeUpTimer"),
    shortLabel: i18n("refresh"),
    description: i18n("pushTheRecoveryDateForward"),
    outcome: i18n("refreshesTheWalletWakeUpTimerWithoutSending"),
    whenToUse:
      i18n("whenAnEligibleSignerWantsToKeepRecovery"),
    whatChanges:
      i18n("movesTheWakeUpTimerForwardWithinThe"),
    pathLabels: [i18n("eligibleSigner")],
    surfaceLabel: i18n("wakeUpTimer"),
    startingPoint: i18n("checkTheNewRecoveryDateBeforeApprovingThe"),
    buildLabel: i18n("previewTimerRefresh"),
    icon: Clock3,
    prerequisites: ["wallet", "preprod", "detected-token", "stt-reference"],
    lane: "advanced",
    group: "manual",
    risk: "medium"
  },
  {
    kind: "wallet-spend",
    label: i18n("advancedManualSend"),
    shortLabel: i18n("manual_4e836f"),
    description: i18n("buildAContractSendByHand"),
    outcome: i18n("movesValueOutOfOneSelectedWalletFunding"),
    whenToUse:
      i18n("onlyForTestingRepairWorkOrCasesThe"),
    whatChanges:
      i18n("usesTheExactManualOutputAndApprovalData"),
    pathLabels: [i18n("manual_4e836f")],
    surfaceLabel: i18n("advancedManualSend"),
    startingPoint: i18n("provideEachInputOutputAndApprovalDetailExplicitly"),
    buildLabel: i18n("previewManualSend"),
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
