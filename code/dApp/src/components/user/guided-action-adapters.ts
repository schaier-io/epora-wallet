import type {
  ActionDraftMap,
  ReadinessIssue,
  UserActionKind
} from "@/components/user/flow-types";
import { formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";
import { DEFAULT_WITHDRAWAL_LOVELACE } from "@/lib/units/lovelace";
import { createDefaultTranslator } from "@/i18n/default-translator";
import countMessages from "@/i18n/generated/default-en/Counts.json";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserGuidedActionAdapters.json";

const i18n = createDefaultTranslator("ComponentsUserGuidedActionAdapters", defaultMessages);
const countI18n = createDefaultTranslator("Counts", countMessages);

export type GuidedActionDraftContext = {
  actionReadinessMap: Record<UserActionKind, ReadinessIssue[]>;
  mint: {
    adminUserCount: number;
    currentStateJson: string;
    defaultStateJson: string;
    starterFundsJson: string;
    defaultStarterFundsJson: string;
    starterFundsSummary: string;
  };
  stt: {
    inputHash: string;
    walletInputCount: number;
    walletOutputCount: number;
    transferCount: number;
    streamingPaymentTransferCount: number;
    authorityPath: "admin" | "multisig";
    detectedTokenActive: boolean;
  };
  useAllowance: {
    matchedUserId: number | null;
  };
  consolidate: {
    inputHash: string;
    walletInputCount: number;
    walletOutputCount: number;
    authorityPath: "admin" | "multisig" | "beneficiary";
  };
  lockFunds: {
    assetCount: number;
    hasCustomInlineDatum: boolean;
  };
  walletSpend: {
    inputHash: string;
    outputCount: number;
  };
  walletWithdraw: {
    rewardAddress: string;
    amount: string;
    sttInputHash: string;
    authorityPath: "admin" | "multisig";
  };
  walletPublish: {
    certificateJson: string;
    sttInputHash: string;
    authorityPath: "admin" | "multisig";
  };
  walletVote: {
    voteJson: string;
    sttInputHash: string;
    authorityPath: "admin" | "multisig";
  };
};

export function getPrimaryBlockingIssue(
  issues: ReadinessIssue[]
): ReadinessIssue | null {
  return issues.find((issue) => issue.blocking) ?? null;
}

function getBlockingHint(issues: ReadinessIssue[]) {
  const primaryBlockingIssue = getPrimaryBlockingIssue(issues);

  if (!primaryBlockingIssue) {
    return null;
  }

  return i18n("value1Value2", { value1: primaryBlockingIssue.label, value2: primaryBlockingIssue.description });
}

function getBlockingSetupIssue(issues: ReadinessIssue[]) {
  return issues.find((issue) => issue.blocking && Boolean(issue.key)) ?? null;
}

function getBlockingFormIssue(issues: ReadinessIssue[]) {
  return issues.find((issue) => issue.blocking && !issue.key) ?? null;
}

function pathLabel(value: "admin" | "multisig" | "beneficiary") {
  if (value === "admin") {
    return i18n("owner");
  }

  if (value === "multisig") {
    return i18n("requiredApprovals");
  }

  return i18n("recoveryContact");
}

export function buildGuidedActionDrafts(
  context: GuidedActionDraftContext
): ActionDraftMap {
  const sttStartHint =
    context.stt.detectedTokenActive || context.stt.inputHash.trim().length > 0
      ? null
      : i18n("pickASmartWalletFirst");
  const mintSetupIssue = getBlockingSetupIssue(context.actionReadinessMap.mint);
  const mintFormIssue = getBlockingFormIssue(context.actionReadinessMap.mint);
  const mintBlockingHint = (() => {
    const formHint = mintFormIssue
      ? i18n("inConfigureActionFixValue1", { value1: mintFormIssue.label })
      : null;
    const setupHint = mintSetupIssue
      ? i18n("value1Value2", { value1: mintSetupIssue.label, value2: mintSetupIssue.description })
      : null;

    return [formHint, setupHint].filter(Boolean).join(" ");
  })();

  return {
    mint: {
      dirty:
        context.mint.currentStateJson !== context.mint.defaultStateJson ||
        context.mint.starterFundsJson !== context.mint.defaultStarterFundsJson,
      ready: !context.actionReadinessMap.mint.some((issue) => issue.blocking),
      summary: i18n("value1Value2_4c86b7", { value1: countI18n("owner", { count: context.mint.adminUserCount }), value2: context.mint.starterFundsSummary }),
      blockingHint: mintBlockingHint || null,
      nextStep:
        context.mint.adminUserCount === 0
          ? i18n("addAtLeastOneOwnerOrConfirmThat")
          : i18n("checkTheReviewThenApproveTheWalletCreation")
    },
    use: {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0 ||
        context.stt.walletOutputCount > 0,
      ready: !context.actionReadinessMap.use.some((issue) => issue.blocking),
      summary: i18n("sendValue1FromValue2", { value1: countI18n("transfer", { count: context.stt.transferCount }), value2: countI18n("fundPool", { count: context.stt.walletInputCount }) }),
      blockingHint: getBlockingHint(context.actionReadinessMap.use),
      nextStep:
        sttStartHint ??
        (context.stt.walletInputCount === 0
          ? i18n("pickWhichFundPoolsToSpendFrom")
          : context.stt.transferCount === 0
            ? i18n("enterTheRecipientAndAmount")
            : i18n("checkTheRecipientsAndAmountsThenContinue"))
    },
    "renew-proof-of-life": {
      dirty: context.stt.inputHash.trim().length > 0,
      ready: !context.actionReadinessMap["renew-proof-of-life"].some((issue) => issue.blocking),
      summary: i18n("refreshTheWalletSWakeUpTimer"),
      blockingHint: getBlockingHint(context.actionReadinessMap["renew-proof-of-life"]),
      nextStep:
        sttStartHint ??
        i18n("reviewTheNewWakeUpTimerThenPreview")
    },
    "update-state": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0 ||
        context.stt.walletOutputCount > 0,
      ready: !context.actionReadinessMap["update-state"].some((issue) => issue.blocking),
      summary: i18n("updateWalletSettingsUsingTheValue1ApprovalPath", { value1: pathLabel(context.stt.authorityPath).toLowerCase() }),
      blockingHint: getBlockingHint(context.actionReadinessMap["update-state"]),
      nextStep:
        sttStartHint ??
        i18n("editTheWalletSettingsYouNeedThenPreview")
    },
    "manage-streaming-payments": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0 ||
        context.stt.walletOutputCount > 0,
      ready: !context.actionReadinessMap["manage-streaming-payments"].some((issue) => issue.blocking),
      summary: i18n("editScheduledPaymentRulesUsingTheValue1Approval", { value1: pathLabel(context.stt.authorityPath).toLowerCase() }),
      blockingHint: getBlockingHint(context.actionReadinessMap["manage-streaming-payments"]),
      nextStep:
        sttStartHint ??
        i18n("adjustTheScheduledPaymentRulesYouNeedThen")
    },
    "use-allowance": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0 ||
        context.stt.walletOutputCount > 0,
      ready: !context.actionReadinessMap["use-allowance"].some((issue) => issue.blocking),
      summary:
        context.useAllowance.matchedUserId !== null
          ? i18n("spenderValue1Value2", { value1: context.useAllowance.matchedUserId, value2: countI18n("transfer", { count: context.stt.transferCount }) })
          : i18n("value1AwaitingAMatchingSpender", { value1: countI18n("transfer", { count: context.stt.transferCount }) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["use-allowance"]),
      nextStep:
        sttStartHint ??
        (context.stt.walletInputCount === 0
          ? i18n("chooseWhichWalletFundPoolsShouldCoverThis")
          : context.stt.transferCount === 0
            ? i18n("enterTheRecipientAndAmountSoTheApp")
            : context.useAllowance.matchedUserId === null
              ? i18n("adjustTheSignerOrAmountsUntilExactlyOne")
              : i18n("reviewTheSpenderSRemainingAllowanceThenPreview"))
    },
    "use-beneficiary": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0,
      ready: !context.actionReadinessMap["use-beneficiary"].some((issue) => issue.blocking),
      summary: i18n("recoveryWithdrawalWithValue1", { value1: countI18n("transfer", { count: context.stt.transferCount }) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["use-beneficiary"]),
      nextStep:
        sttStartHint ??
        (context.stt.walletInputCount === 0
          ? i18n("chooseWhichWalletFundPoolsTheRecoveryContact")
          : context.stt.transferCount === 0
            ? i18n("enterTheRecipientAndAmountForThisRecovery")
            : i18n("reviewTheRecoveryContactSOneTimeShare"))
    },
    "payout-streaming-payment": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.streamingPaymentTransferCount > 0,
      ready: !context.actionReadinessMap["payout-streaming-payment"].some((issue) => issue.blocking),
      summary: i18n("value1FromValue2", { value1: countI18n("scheduledPayout", { count: context.stt.streamingPaymentTransferCount }), value2: countI18n("fundPool", { count: context.stt.walletInputCount }) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["payout-streaming-payment"]),
      nextStep:
        sttStartHint ??
        (context.stt.walletInputCount === 0
          ? i18n("chooseWhichWalletFundPoolsShouldCoverThe")
          : context.stt.streamingPaymentTransferCount === 0
            ? i18n("selectAtLeastOneScheduledPaymentAmount")
            : i18n("reviewTheRecipientsAndDueAmountsThenPreview"))
    },
    "consolidate-utxo": {
      dirty:
        context.consolidate.inputHash.trim().length > 0 ||
        context.consolidate.walletInputCount > 0 ||
        context.consolidate.walletOutputCount > 0,
      ready: !context.actionReadinessMap["consolidate-utxo"].some((issue) => issue.blocking),
      summary: i18n("mergeValue1IntoValue2", { value1: countI18n("fundPool", { count: context.consolidate.walletInputCount }), value2: countI18n("pool", { count: context.consolidate.walletOutputCount }) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["consolidate-utxo"]),
      nextStep:
        context.consolidate.inputHash.trim().length === 0
          ? i18n("chooseTheSmartWalletWhoseFundPoolsYou")
          : context.consolidate.walletInputCount === 0
            ? i18n("chooseTheWalletFundPoolsYouWantTo")
            : i18n("reviewTheResultingFundPoolsThenPreviewThe")
    },
    "lock-funds": {
      dirty: context.lockFunds.assetCount > 0 || context.lockFunds.hasCustomInlineDatum,
      ready: !context.actionReadinessMap["lock-funds"].some((issue) => issue.blocking),
      summary: i18n("value1ReadyToAdd", { value1: countI18n("asset", { count: context.lockFunds.assetCount }) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["lock-funds"]),
      nextStep:
        context.lockFunds.assetCount === 0
          ? i18n("shareTheWalletSReceiveAddressOrAdd")
          : i18n("reviewTheAssetsAndDestinationThenPreviewThe")
    },
    "wallet-spend": {
      dirty:
        context.walletSpend.inputHash.trim().length > 0 || context.walletSpend.outputCount > 0,
      ready: !context.actionReadinessMap["wallet-spend"].some((issue) => issue.blocking),
      summary: i18n("manualWalletSpendWithValue1", { value1: countI18n("destination", { count: context.walletSpend.outputCount }) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["wallet-spend"]),
      nextStep:
        context.walletSpend.inputHash.trim().length === 0
          ? i18n("enterTheWalletFundReferenceYouWantTo")
          : context.walletSpend.outputCount === 0
            ? i18n("addEachDestinationAndTheRequiredContractAction")
            : i18n("reviewThisAdvancedManualSpendThenBuildThe")
    },
    "wallet-withdraw": {
      dirty:
        context.walletWithdraw.rewardAddress.trim().length > 0 ||
        context.walletWithdraw.amount !== DEFAULT_WITHDRAWAL_LOVELACE ||
        context.walletWithdraw.sttInputHash.trim().length > 0,
      ready: !context.actionReadinessMap["wallet-withdraw"].some((issue) => issue.blocking),
      summary: i18n("claimValue1AdaInStakingRewards", { value1: formatLovelaceAsAda(context.walletWithdraw.amount) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["wallet-withdraw"]),
      nextStep:
        context.walletWithdraw.sttInputHash.trim().length === 0
          ? i18n("chooseTheSmartWalletThatEarnedTheseRewards")
          : context.walletWithdraw.rewardAddress.trim().length === 0
            ? i18n("enterTheStakingAddressYouWantToWithdraw")
            : i18n("reviewTheRewardAddressAndAmountThenPreview")
    },
    "set-intended-stake-credential": {
      dirty: false,
      ready: !context.actionReadinessMap["set-intended-stake-credential"].some(
        (issue) => issue.blocking
      ),
      summary: i18n("enableStakingForThisWallet"),
      blockingHint: getBlockingHint(
        context.actionReadinessMap["set-intended-stake-credential"]
      ),
      nextStep: i18n("confirmEnablingStakingThenBuildThePreview")
    },
    "wallet-publish": {
      dirty:
        context.walletPublish.certificateJson.trim().length > 0 ||
        context.walletPublish.sttInputHash.trim().length > 0,
      ready: !context.actionReadinessMap["wallet-publish"].some((issue) => issue.blocking),
      summary: i18n("publishACardanoGovernanceCertificate"),
      blockingHint: getBlockingHint(context.actionReadinessMap["wallet-publish"]),
      nextStep:
        context.walletPublish.sttInputHash.trim().length === 0
          ? i18n("chooseTheSmartWalletThatWillPublishThis")
          : context.walletPublish.certificateJson.trim().length === 0
            ? i18n("pasteTheCertificateJsonYouWantToPublish")
            : i18n("reviewTheCertificateAndRequiredApprovalsThenBuild")
    },
    "wallet-vote": {
      dirty:
        context.walletVote.voteJson.trim().length > 0 ||
        context.walletVote.sttInputHash.trim().length > 0,
      ready: !context.actionReadinessMap["wallet-vote"].some((issue) => issue.blocking),
      summary: i18n("castACardanoGovernanceVote"),
      blockingHint: getBlockingHint(context.actionReadinessMap["wallet-vote"]),
      nextStep:
        context.walletVote.sttInputHash.trim().length === 0
          ? i18n("chooseTheSmartWalletThatWillCastThis")
          : context.walletVote.voteJson.trim().length === 0
            ? i18n("pasteTheVoteJsonYouWantToCast")
            : i18n("reviewTheVoteAndRequiredApprovalsThenBuild")
    }
  };
}
