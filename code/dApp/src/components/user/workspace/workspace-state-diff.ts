import { type ReviewReceiptItem } from "@/components/user/review-panel";
import {
  type BeneficiaryFormState,
  type StateAssetAmountForm,
  type StateFormState,
  type StreamingPaymentFormState,
  type UserFormState
} from "@/lib/contracts/state-form";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceWorkspaceStateDiff.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceWorkspaceStateDiff", defaultMessages);

/**
 * What an `update-state` transaction actually changes, as review rows.
 *
 * The receipt used to be four counts of the *resulting* state: name, owner count, recovery
 * contact count, schedule count. Counts cannot show a change that keeps the count the same,
 * so raising a spending limit, swapping an owner's key, repointing a recovery contact or a
 * schedule, moving the proof of life, or lowering the approval threshold all produced a
 * review screen identical to the one before the edit. The review step is the only human
 * checkpoint between an edited form and an on-chain state rewrite, so it has to be able to
 * represent what it is checkpointing.
 *
 * Both sides are already in memory at review time: `stateFormFromDatum(token.datum)` is the
 * current state and the editor form is the next one.
 */

const NO_CHANGES_LABEL = "No changes";

function shortenKey(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 16 ? `${trimmed.slice(0, 8)}…${trimmed.slice(-6)}` : trimmed;
}

function formatKeyList(wallets: string[]): string {
  if (wallets.length === 0) {
    return "no keys";
  }
  return wallets.map(shortenKey).join(", ");
}

function formatAssetAmount(entry: StateAssetAmountForm): string {
  const isAda = entry.policyId.length === 0 && entry.assetName.length === 0;
  return isAda ? `${formatLovelaceAsAda(entry.amount)} ₳` : `${entry.amount} ${entry.assetName || entry.policyId}`;
}

function formatAllowance(entries: StateAssetAmountForm[]): string {
  if (entries.length === 0) {
    return "no daily limit";
  }
  return entries.map(formatAssetAmount).join(" + ");
}

function formatOption(mode: "none" | "some", value: string, unset: string): string {
  return mode === "some" && value.trim().length > 0 ? value.trim() : unset;
}

function formatTimestamp(value: string): string {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return value.trim() || "unset";
  }
  return new Date(asNumber).toLocaleString();
}

function change(before: string, after: string): string {
  return `${before} → ${after}`;
}

// Every editable field must appear here: the collection diff detects an edit by
// comparing these strings, so a field left out changes the datum in silence.
function describeUser(user: UserFormState): string {
  const role = user.isAdmin ? "owner" : "spender";
  const power = formatOption(user.multiSigPowerMode, user.multiSigPower, "no vote");
  const renews = user.canRenewProofOfLife ? "renews the timer" : "cannot renew the timer";
  return `${role} · ${formatKeyList(user.wallets)} · power ${power} · ${renews} · ${formatAllowance(user.perDayAllowance)}`;
}

function describeBeneficiary(entry: BeneficiaryFormState): string {
  const wait =
    entry.unlockAfterMode === "some" && entry.unlockAfter.trim()
      ? `after ${formatTimestamp(entry.unlockAfter)}`
      : "no extra wait";
  return `${formatKeyList(entry.wallets)} · share ${entry.weight || "1"} · ${wait}`;
}

function describeSchedule(entry: StreamingPaymentFormState): string {
  return `${shortenKey(entry.payoutAddress)} · ${formatLovelaceAsAda(entry.amountPerDay || "0")} ₳/day · ${formatTimestamp(entry.startDate)} → ${formatTimestamp(entry.endDate)}`;
}

type Keyed = { id: string };

/**
 * Compare two id-keyed collections and emit one row per added, removed, or edited entry.
 * Edited entries are the reason this exists: they are invisible to a count.
 */
function diffCollection<T extends Keyed>(
  before: T[],
  after: T[],
  options: {
    label: string;
    describe: (entry: T) => string;
    addedDetail: string;
    removedDetail: string;
    changedDetail: string;
  }
): ReviewReceiptItem[] {
  const beforeById = new Map(before.map((entry) => [entry.id, entry]));
  const afterById = new Map(after.map((entry) => [entry.id, entry]));
  const items: ReviewReceiptItem[] = [];

  for (const entry of after) {
    const previous = beforeById.get(entry.id);
    if (!previous) {
      items.push({
        label: i18n("value1Added", { value1: options.label }),
        value: options.describe(entry),
        detail: options.addedDetail,
        tone: "warning"
      });
      continue;
    }
    const previousText = options.describe(previous);
    const nextText = options.describe(entry);
    if (previousText !== nextText) {
      items.push({
        label: i18n("value1Changed", { value1: options.label }),
        value: change(previousText, nextText),
        detail: options.changedDetail,
        tone: "warning"
      });
    }
  }

  for (const entry of before) {
    if (!afterById.has(entry.id)) {
      items.push({
        label: i18n("value1Removed", { value1: options.label }),
        value: options.describe(entry),
        detail: options.removedDetail,
        tone: "warning"
      });
    }
  }

  return items;
}

export function diffStateForms(
  before: StateFormState | null,
  after: StateFormState
): ReviewReceiptItem[] {
  if (!before) {
    return [];
  }

  const items: ReviewReceiptItem[] = [];

  if (before.walletName.trim() !== after.walletName.trim()) {
    items.push({
      label: i18n("name"),
      value: change(before.walletName.trim() || "unnamed", after.walletName.trim() || "unnamed"),
      detail: i18n("onlyTheLabelYouSeeItChangesNothing")
    });
  }

  items.push(
    ...diffCollection(before.users, after.users, {
      label: i18n("person"),
      describe: describeUser,
      addedDetail: "This person can spend from the wallet once the transaction is signed.",
      removedDetail: "This person loses access as soon as the transaction is signed.",
      changedDetail: "Their keys, spending limit, voting power, or timer right are not what they were."
    })
  );

  const beforeThreshold = formatOption(
    before.multiSigThresholdMode,
    before.multiSigThreshold,
    "any single owner"
  );
  const afterThreshold = formatOption(
    after.multiSigThresholdMode,
    after.multiSigThreshold,
    "any single owner"
  );
  if (beforeThreshold !== afterThreshold) {
    items.push({
      label: i18n("approvalsNeeded"),
      value: change(beforeThreshold, afterThreshold),
      detail: i18n("howMuchCombinedSigningPowerATransactionNeeds"),
      tone: "warning"
    });
  }

  items.push(
    ...diffCollection(before.beneficiaries, after.beneficiaries, {
      label: i18n("recoveryContact"),
      describe: describeBeneficiary,
      addedDetail: "They can claim this wallet once the proof of life runs out.",
      removedDetail: "They can no longer claim this wallet after the timer runs out.",
      changedDetail: "The keys that can claim this wallet, their share, or their extra wait have moved."
    })
  );

  const beforeUnlock = formatOption(
    before.proofOfLifeUnlockTimeMode,
    before.proofOfLifeUnlockTime,
    "off"
  );
  const afterUnlock = formatOption(
    after.proofOfLifeUnlockTimeMode,
    after.proofOfLifeUnlockTime,
    "off"
  );
  if (beforeUnlock !== afterUnlock) {
    items.push({
      label: i18n("proofOfLife"),
      value: change(
        beforeUnlock === "off" ? "off" : formatTimestamp(beforeUnlock),
        afterUnlock === "off" ? "off" : formatTimestamp(afterUnlock)
      ),
      detail:
        afterUnlock === "off"
          ? i18n("recoveryContactsCanNeverClaimThisWalletWhile")
          : i18n("ifNoOwnerSignsBeforeThisMomentRecovery"),
      tone: "warning"
    });
  }

  const beforeIncrement = formatOption(
    before.proofOfLifeIncrementMode,
    before.proofOfLifeIncrement,
    "unset"
  );
  const afterIncrement = formatOption(
    after.proofOfLifeIncrementMode,
    after.proofOfLifeIncrement,
    "unset"
  );
  if (beforeIncrement !== afterIncrement) {
    items.push({
      label: i18n("timerExtension"),
      value: change(beforeIncrement, afterIncrement),
      detail: i18n("howFarTheProofOfLifeMovesForward")
    });
  }

  items.push(
    ...diffCollection(before.streamingPayments, after.streamingPayments, {
      label: i18n("scheduledPayment"),
      describe: describeSchedule,
      addedDetail: "This address can be paid from the wallet on this schedule.",
      removedDetail: "This schedule stops. Nothing further accrues to that address.",
      changedDetail: "The payee, the rate, or the dates are not what they were."
    })
  );

  return items;
}

/**
 * The rows to show for an `update-state` review. Falls back to `fallback` (the old
 * post-change snapshot) when there is no baseline to diff against, a wallet whose current
 * datum has not loaded yet. Showing a stale snapshot is better than showing nothing, but the
 * caller should say which one the user is looking at.
 */
export function buildStateChangeItems(
  before: StateFormState | null,
  after: StateFormState,
  fallback: ReviewReceiptItem[]
): { items: ReviewReceiptItem[]; isDiff: boolean } {
  if (!before) {
    return { items: fallback, isDiff: false };
  }

  const diff = diffStateForms(before, after);
  if (diff.length === 0) {
    return {
      items: [
        {
          label: NO_CHANGES_LABEL,
          value: "Nothing to apply",
          detail: i18n("thisTransactionWouldRewriteTheWalletSRules")
        }
      ],
      isDiff: true
    };
  }

  return { items: diff, isDiff: true };
}
