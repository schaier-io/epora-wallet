import type {
  ActionDraftMap,
  ReadinessIssue,
  UserActionKind
} from "@/components/user/flow-types";
import { formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";

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
    return "Admin";
  }

  if (value === "multisig") {
    return "Multisig";
  }

  return "Recovery contact";
}

export function buildGuidedActionDrafts(
  context: GuidedActionDraftContext
): ActionDraftMap {
  const sttStartHint =
    context.stt.detectedTokenActive || context.stt.inputHash.trim().length > 0
      ? null
      : "Pick a smart wallet first.";
  const mintSetupIssue = getBlockingSetupIssue(context.actionReadinessMap.mint);
  const mintFormIssue = getBlockingFormIssue(context.actionReadinessMap.mint);
  const mintBlockingHint = (() => {
    const formHint =
      mintFormIssue?.label === "Zero-admin confirmation"
        ? "In Configure Action > Mint state, add an admin user or confirm the zero-admin state."
        : mintFormIssue
          ? `In Configure Action, fix ${mintFormIssue.label}.`
          : null;
    const setupHint = mintSetupIssue
      ? `${mintSetupIssue.label}: ${mintSetupIssue.description}`
      : null;

    return [formHint, setupHint].filter(Boolean).join(" ");
  })();

  return {
    mint: {
      dirty:
        context.mint.currentStateJson !== context.mint.defaultStateJson ||
        context.mint.starterFundsJson !== context.mint.defaultStarterFundsJson,
      ready: !context.actionReadinessMap.mint.some((issue) => issue.blocking),
      summary: `${context.mint.adminUserCount} owner(s), ${context.mint.starterFundsSummary}`,
      blockingHint: mintBlockingHint || null,
      nextStep:
        context.mint.adminUserCount === 0
          ? "Add at least one owner, or confirm that this wallet should start without a direct owner."
          : "Check the receipt, then approve the wallet creation."
    },
    use: {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0 ||
        context.stt.walletOutputCount > 0,
      ready: !context.actionReadinessMap.use.some((issue) => issue.blocking),
      summary: `${pathLabel(context.stt.authorityPath)} path, ${context.stt.walletInputCount} locked input(s), ${context.stt.transferCount} transfer(s)`,
      blockingHint: getBlockingHint(context.actionReadinessMap.use),
      nextStep:
        sttStartHint ??
        (context.stt.walletInputCount === 0
          ? `Pick which fund pools to spend from.`
          : context.stt.transferCount === 0
            ? "Enter the recipient and amount."
            : "Review the receipt and continue.")
    },
    "renew-proof-of-life": {
      dirty: context.stt.inputHash.trim().length > 0,
      ready: !context.actionReadinessMap["renew-proof-of-life"].some((issue) => issue.blocking),
      summary: "Proof-of-life renewal only",
      blockingHint: getBlockingHint(context.actionReadinessMap["renew-proof-of-life"]),
      nextStep:
        sttStartHint ??
        "Review the proof-of-life timing below and build the renewal preview without adding wallet transfers."
    },
    "update-state": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0 ||
        context.stt.walletOutputCount > 0,
      ready: !context.actionReadinessMap["update-state"].some((issue) => issue.blocking),
      summary: `${pathLabel(context.stt.authorityPath)} path, state edit with ${context.stt.walletInputCount} locked input(s)`,
      blockingHint: getBlockingHint(context.actionReadinessMap["update-state"]),
      nextStep:
        sttStartHint ??
        "Edit the non-streaming-payment STT fields you want to change, then build the update preview."
    },
    "manage-streaming-payments": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0 ||
        context.stt.walletOutputCount > 0,
      ready: !context.actionReadinessMap["manage-streaming-payments"].some((issue) => issue.blocking),
      summary: `${pathLabel(context.stt.authorityPath)} path, streaming payment edit with ${context.stt.walletInputCount} locked input(s)`,
      blockingHint: getBlockingHint(context.actionReadinessMap["manage-streaming-payments"]),
      nextStep:
        sttStartHint ??
        "Adjust only the streaming payment fields you need, then build the streaming payment management preview."
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
          ? `Matched user ${context.useAllowance.matchedUserId}, ${context.stt.transferCount} transfer(s)`
          : `${context.stt.walletInputCount} locked input(s), ${context.stt.transferCount} transfer(s)`,
      blockingHint: getBlockingHint(context.actionReadinessMap["use-allowance"]),
      nextStep:
        sttStartHint ??
        (context.stt.walletInputCount === 0
          ? "Choose the locked inputs that fund the allowance withdrawal."
          : context.stt.transferCount === 0
            ? "Enter the recipient and amount so the app can match the correct allowance user."
            : context.useAllowance.matchedUserId === null
              ? "Adjust the signer or transfer amounts until exactly one allowance user matches."
              : "Review the derived allowance state and build the preview.")
    },
    "use-beneficiary": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.transferCount > 0,
      ready: !context.actionReadinessMap["use-beneficiary"].some((issue) => issue.blocking),
      summary: `${context.stt.walletInputCount} locked input(s), ${context.stt.transferCount} transfer(s)`,
      blockingHint: getBlockingHint(context.actionReadinessMap["use-beneficiary"]),
      nextStep:
        sttStartHint ??
        (context.stt.walletInputCount === 0
          ? "Choose the locked inputs the beneficiary should withdraw from."
          : context.stt.transferCount === 0
            ? "Enter the recipient and amount for this beneficiary withdrawal."
            : "Review the inferred beneficiary withdrawal and build the preview.")
    },
    "payout-streaming-payment": {
      dirty:
        context.stt.inputHash.trim().length > 0 ||
        context.stt.walletInputCount > 0 ||
        context.stt.streamingPaymentTransferCount > 0,
      ready: !context.actionReadinessMap["payout-streaming-payment"].some((issue) => issue.blocking),
      summary: `${context.stt.walletInputCount} funding input(s), ${context.stt.streamingPaymentTransferCount} payout(s)`,
      blockingHint: getBlockingHint(context.actionReadinessMap["payout-streaming-payment"]),
      nextStep:
        sttStartHint ??
        (context.stt.walletInputCount === 0
          ? "Choose the locked inputs that should fund the selected streaming payments."
          : context.stt.streamingPaymentTransferCount === 0
            ? "Select at least one streaming payment payout before building."
            : "Review the streaming payment outputs and build the payout preview.")
    },
    "consolidate-utxo": {
      dirty:
        context.consolidate.inputHash.trim().length > 0 ||
        context.consolidate.walletInputCount > 0 ||
        context.consolidate.walletOutputCount > 0,
      ready: !context.actionReadinessMap["consolidate-utxo"].some((issue) => issue.blocking),
      summary: `${pathLabel(context.consolidate.authorityPath)} path, ${context.consolidate.walletInputCount} input(s), ${context.consolidate.walletOutputCount} output(s)`,
      blockingHint: getBlockingHint(context.actionReadinessMap["consolidate-utxo"]),
      nextStep:
        context.consolidate.inputHash.trim().length === 0
          ? "Select a detected STT token or paste the STT input reference first."
          : context.consolidate.walletInputCount === 0
            ? "Choose the wallet-script UTxOs you want to merge."
            : "Review the target locked outputs and build the consolidation preview."
    },
    "lock-funds": {
      dirty: context.lockFunds.assetCount > 0 || context.lockFunds.hasCustomInlineDatum,
      ready: !context.actionReadinessMap["lock-funds"].some((issue) => issue.blocking),
      summary: `${context.lockFunds.assetCount} asset row(s) ready to lock`,
      blockingHint: getBlockingHint(context.actionReadinessMap["lock-funds"]),
      nextStep:
        context.lockFunds.assetCount === 0
          ? "Share the receive address or add the assets you want to lock into the wallet script."
          : "Review the deposit output and build the funding preview."
    },
    "wallet-spend": {
      dirty:
        context.walletSpend.inputHash.trim().length > 0 || context.walletSpend.outputCount > 0,
      ready: !context.actionReadinessMap["wallet-spend"].some((issue) => issue.blocking),
      summary: `${context.walletSpend.outputCount} output(s) configured`,
      blockingHint: getBlockingHint(context.actionReadinessMap["wallet-spend"]),
      nextStep:
        context.walletSpend.inputHash.trim().length === 0
          ? "Enter the wallet-script input you want to spend manually."
          : context.walletSpend.outputCount === 0
            ? "Add the manual outputs and redeemer details before building."
            : "Review the low-level spend and build the preview."
    },
    "wallet-withdraw": {
      dirty:
        context.walletWithdraw.rewardAddress.trim().length > 0 ||
        context.walletWithdraw.amount !== "1000000" ||
        context.walletWithdraw.sttInputHash.trim().length > 0,
      ready: !context.actionReadinessMap["wallet-withdraw"].some((issue) => issue.blocking),
      summary: `${pathLabel(context.walletWithdraw.authorityPath)} path, ${formatLovelaceAsAda(context.walletWithdraw.amount)} ADA`,
      blockingHint: getBlockingHint(context.actionReadinessMap["wallet-withdraw"]),
      nextStep:
        context.walletWithdraw.sttInputHash.trim().length === 0
          ? "Select a detected STT token or set the forwarded STT input first."
          : context.walletWithdraw.rewardAddress.trim().length === 0
            ? "Enter the staking address you want to withdraw from."
            : "Review the forwarded state and build the staking preview."
    },
    "set-intended-stake-credential": {
      dirty: false,
      ready: !context.actionReadinessMap["set-intended-stake-credential"].some(
        (issue) => issue.blocking
      ),
      summary: "Enable staking for this wallet",
      blockingHint: getBlockingHint(
        context.actionReadinessMap["set-intended-stake-credential"]
      ),
      nextStep: "Confirm enabling staking, then build the preview."
    },
    "wallet-publish": {
      dirty:
        context.walletPublish.certificateJson.trim().length > 0 ||
        context.walletPublish.sttInputHash.trim().length > 0,
      ready: !context.actionReadinessMap["wallet-publish"].some((issue) => issue.blocking),
      summary: `${pathLabel(context.walletPublish.authorityPath)} path, advanced certificate payload`,
      blockingHint: getBlockingHint(context.actionReadinessMap["wallet-publish"]),
      nextStep:
        context.walletPublish.sttInputHash.trim().length === 0
          ? "Select a detected STT token or set the forwarded STT input first."
          : context.walletPublish.certificateJson.trim().length === 0
            ? "Paste the certificate JSON you want to publish."
            : "Review the wrapper state and build the certificate preview."
    },
    "wallet-vote": {
      dirty:
        context.walletVote.voteJson.trim().length > 0 ||
        context.walletVote.sttInputHash.trim().length > 0,
      ready: !context.actionReadinessMap["wallet-vote"].some((issue) => issue.blocking),
      summary: `${pathLabel(context.walletVote.authorityPath)} path, advanced vote payload`,
      blockingHint: getBlockingHint(context.actionReadinessMap["wallet-vote"]),
      nextStep:
        context.walletVote.sttInputHash.trim().length === 0
          ? "Select a detected STT token or set the forwarded STT input first."
          : context.walletVote.voteJson.trim().length === 0
            ? "Paste the vote JSON you want to cast."
            : "Review the wrapper state and build the vote preview."
    }
  };
}
