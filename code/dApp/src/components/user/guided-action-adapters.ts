import type {
  ActionDraftMap,
  ReadinessIssue,
  UserActionKind
} from "@/components/user/flow-types";
import { formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";
import { formatCountLabel } from "@/components/user/workspace/helpers/formatters";
import { DEFAULT_WITHDRAWAL_LOVELACE } from "@/lib/units/lovelace";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserGuidedActionAdapters.json";

const i18n = createDefaultTranslator("ComponentsUserGuidedActionAdapters", defaultMessages);

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

  return `${primaryBlockingIssue.label}: ${primaryBlockingIssue.description}`;
}

function getBlockingSetupIssue(issues: ReadinessIssue[]) {
  return issues.find((issue) => issue.blocking && Boolean(issue.key)) ?? null;
}

function getBlockingFormIssue(issues: ReadinessIssue[]) {
  return issues.find((issue) => issue.blocking && !issue.key) ?? null;
}

function pathLabel(value: "admin" | "multisig" | "beneficiary") {
  if (value === "admin") {
    return "Owner";
  }

  if (value === "multisig") {
    return "Co-signers";
  }

  return "Recovery contact";
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
    const formHint =
      mintFormIssue?.label === "Wallet with no owner"
        ? i18n("openMintStateAndAddAnOwnerOr")
        : mintFormIssue
          ? i18n("inConfigureActionFixValue1_d8973f", { value1: mintFormIssue.label })
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
      summary: i18n("value1Value2_4c86b7", { value1: formatCountLabel(context.mint.adminUserCount, i18n("owner_579233")), value2: context.mint.starterFundsSummary }),
      blockingHint: mintBlockingHint || null,
      nextStep:
        context.mint.adminUserCount === 0
          ? i18n("addAtLeastOneOwnerOrConfirmThat")
          : i18n("checkTheReceiptThenApproveTheWalletCreation")
    },
    use: {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0 ||
        context.stt.walletOutputCount > 0,
      ready: !context.actionReadinessMap.use.some((issue) => issue.blocking),
      summary: i18n("value1PathValue2Value3", { value1: pathLabel(context.stt.authorityPath), value2: formatCountLabel(context.stt.walletInputCount, i18n("fundPool")), value3: formatCountLabel(context.stt.transferCount, i18n("payout")) }),
      blockingHint: getBlockingHint(context.actionReadinessMap.use),
      // Payouts first. Fund pools are seeded automatically the moment a payout is staged,
      // so testing `walletInputCount` first named the one step the app does for you, and
      // named it while the step the user actually has to take was still outstanding.
      nextStep:
        sttStartHint ??
        (context.stt.transferCount === 0
          ? i18n("addAPayoutPickARecipientEnterAn")
          : context.stt.walletInputCount === 0
            ? i18n("pickWhichFundPoolsToSpendFrom")
            : i18n("reviewTheReceiptAndContinue"))
    },
    "renew-proof-of-life": {
      dirty: context.stt.inputHash.trim().length > 0,
      ready: !context.actionReadinessMap["renew-proof-of-life"].some((issue) => issue.blocking),
      summary: i18n("extendsTheProofOfLifeNothingElse"),
      blockingHint: getBlockingHint(context.actionReadinessMap["renew-proof-of-life"]),
      nextStep:
        sttStartHint ??
        i18n("checkTheProofOfLifeDatesBelowThen")
    },
    "update-state": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0 ||
        context.stt.walletOutputCount > 0,
      ready: !context.actionReadinessMap["update-state"].some((issue) => issue.blocking),
      summary: i18n("value1PathSettingsChangeValue2", { value1: pathLabel(context.stt.authorityPath), value2: formatCountLabel(context.stt.walletInputCount, i18n("fundPool")) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["update-state"]),
      nextStep:
        sttStartHint ??
        i18n("changeThePeopleAndSettingsYouNeedThen")
    },
    "manage-streaming-payments": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0 ||
        context.stt.walletOutputCount > 0,
      ready: !context.actionReadinessMap["manage-streaming-payments"].some((issue) => issue.blocking),
      summary: i18n("value1PathScheduleChangeValue2", { value1: pathLabel(context.stt.authorityPath), value2: formatCountLabel(context.stt.walletInputCount, i18n("fundPool")) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["manage-streaming-payments"]),
      nextStep:
        sttStartHint ??
        i18n("changeOnlyTheFieldsYouNeedThenBuild")
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
          ? i18n("spenderValue1Value2_e66298", { value1: context.useAllowance.matchedUserId, value2: formatCountLabel(context.stt.transferCount, i18n("payout")) })
          : i18n("value1Value2_4c86b7", { value1: formatCountLabel(context.stt.walletInputCount, i18n("fundPool")), value2: formatCountLabel(context.stt.transferCount, i18n("payout")) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["use-allowance"]),
      // Payouts first, same reason as `use` above.
      nextStep:
        sttStartHint ??
        (context.stt.transferCount === 0
          ? i18n("addAPayoutPickARecipientAndAn")
          : context.stt.walletInputCount === 0
            ? i18n("chooseTheFundPoolsThisAllowancePaymentComes")
            : context.useAllowance.matchedUserId === null
              ? i18n("adjustTheSignerOrTransferAmountsUntilExactly")
              : i18n("reviewTheDerivedAllowanceStateAndBuildThe"))
    },
    "use-beneficiary": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0,
      ready: !context.actionReadinessMap["use-beneficiary"].some((issue) => issue.blocking),
      summary: i18n("value1Value2_4c86b7", { value1: formatCountLabel(context.stt.walletInputCount, i18n("fundPool")), value2: formatCountLabel(context.stt.transferCount, i18n("payout")) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["use-beneficiary"]),
      // Payouts first, same reason as `use` above.
      nextStep:
        sttStartHint ??
        (context.stt.transferCount === 0
          ? i18n("addAPayoutPickARecipientAndAn_fc7f7e")
          : context.stt.walletInputCount === 0
            ? i18n("chooseTheFundPoolsTheRecoveryContactShould")
            : i18n("reviewTheInferredRecoveryContactWithdrawalAndBuild"))
    },
    "payout-streaming-payment": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.streamingPaymentTransferCount > 0,
      ready: !context.actionReadinessMap["payout-streaming-payment"].some((issue) => issue.blocking),
      summary: i18n("value1Value2_4c86b7", { value1: formatCountLabel(context.stt.walletInputCount, i18n("fundPool")), value2: formatCountLabel(context.stt.streamingPaymentTransferCount, i18n("payout")) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["payout-streaming-payment"]),
      nextStep:
        sttStartHint ??
        (context.stt.walletInputCount === 0
          ? i18n("chooseTheFundPoolsThatShouldCoverThe")
          : context.stt.streamingPaymentTransferCount === 0
            ? i18n("selectAtLeastOneScheduledPaymentPayoutBefore")
            : i18n("reviewTheScheduledPaymentOutputsAndBuildThe"))
    },
    "consolidate-utxo": {
      dirty:
        context.consolidate.inputHash.trim().length > 0 ||
        context.consolidate.walletInputCount > 0 ||
        context.consolidate.walletOutputCount > 0,
      ready: !context.actionReadinessMap["consolidate-utxo"].some((issue) => issue.blocking),
      summary: i18n("value1PathValue2InValue3Out", { value1: pathLabel(context.consolidate.authorityPath), value2: formatCountLabel(context.consolidate.walletInputCount, i18n("fundPool")), value3: formatCountLabel(context.consolidate.walletOutputCount, i18n("newFundPool")) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["consolidate-utxo"]),
      nextStep:
        context.consolidate.inputHash.trim().length === 0
          ? i18n("chooseASmartWalletFirstOrPasteIts")
          : context.consolidate.walletInputCount === 0
            ? i18n("chooseTheFundPoolsYouWantToMerge")
            : i18n("reviewTheNewFundPoolsThenBuildThe")
    },
    "lock-funds": {
      dirty: context.lockFunds.assetCount > 0 || context.lockFunds.hasCustomInlineDatum,
      ready: !context.actionReadinessMap["lock-funds"].some((issue) => issue.blocking),
      summary: i18n("value1ReadyToLock", { value1: formatCountLabel(context.lockFunds.assetCount, i18n("assetRow")) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["lock-funds"]),
      nextStep:
        context.lockFunds.assetCount === 0
          ? i18n("shareTheReceiveAddressOrAddTheAssets")
          : i18n("reviewTheDepositOutputAndBuildTheFunding")
    },
    "wallet-spend": {
      dirty:
        context.walletSpend.inputHash.trim().length > 0 || context.walletSpend.outputCount > 0,
      ready: !context.actionReadinessMap["wallet-spend"].some((issue) => issue.blocking),
      summary: i18n("value1Configured", { value1: formatCountLabel(context.walletSpend.outputCount, i18n("output")) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["wallet-spend"]),
      nextStep:
        context.walletSpend.inputHash.trim().length === 0
          ? i18n("enterTheWalletScriptInputYouWantTo")
          : context.walletSpend.outputCount === 0
            ? i18n("addTheManualOutputsAndRedeemerDetailsBefore")
            : i18n("reviewTheLowLevelSpendAndBuildThe")
    },
    "wallet-withdraw": {
      dirty:
        context.walletWithdraw.rewardAddress.trim().length > 0 ||
        context.walletWithdraw.amount !== DEFAULT_WITHDRAWAL_LOVELACE ||
        context.walletWithdraw.sttInputHash.trim().length > 0,
      ready: !context.actionReadinessMap["wallet-withdraw"].some((issue) => issue.blocking),
      summary: i18n("value1PathValue2Ada", { value1: pathLabel(context.walletWithdraw.authorityPath), value2: formatLovelaceAsAda(context.walletWithdraw.amount) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["wallet-withdraw"]),
      nextStep:
        context.walletWithdraw.sttInputHash.trim().length === 0
          ? i18n("chooseASmartWalletFirstOrSetIts")
          : context.walletWithdraw.rewardAddress.trim().length === 0
            ? i18n("enterTheStakingAddressYouWantToWithdraw")
            : i18n("reviewTheForwardedStateAndBuildTheStaking")
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
      summary: i18n("value1PathAdvancedCertificatePayload", { value1: pathLabel(context.walletPublish.authorityPath) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["wallet-publish"]),
      nextStep:
        context.walletPublish.sttInputHash.trim().length === 0
          ? i18n("chooseASmartWalletFirstOrSetIts")
          : context.walletPublish.certificateJson.trim().length === 0
            ? i18n("pasteTheCertificateJsonYouWantToPublish")
            : i18n("reviewTheWrapperStateAndBuildTheCertificate")
    },
    "wallet-vote": {
      dirty:
        context.walletVote.voteJson.trim().length > 0 ||
        context.walletVote.sttInputHash.trim().length > 0,
      ready: !context.actionReadinessMap["wallet-vote"].some((issue) => issue.blocking),
      summary: i18n("value1PathAdvancedVotePayload", { value1: pathLabel(context.walletVote.authorityPath) }),
      blockingHint: getBlockingHint(context.actionReadinessMap["wallet-vote"]),
      nextStep:
        context.walletVote.sttInputHash.trim().length === 0
          ? i18n("chooseASmartWalletFirstOrSetIts")
          : context.walletVote.voteJson.trim().length === 0
            ? i18n("pasteTheVoteJsonYouWantToCast")
            : i18n("reviewTheWrapperStateAndBuildTheVote")
    }
  };
}
