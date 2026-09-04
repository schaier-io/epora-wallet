import { type ReviewReceiptItem } from "@/components/user/review-panel";
import {
  type BeneficiaryFormState,
  type StateAssetAmountForm,
  type StateFormState,
  type StreamingPaymentFormState,
  type UserFormState
} from "@/lib/contracts/state-form";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import { createDefaultTranslator, defaultFormatter } from "@/i18n/default-translator";
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

const NO_CHANGES_LABEL = i18n("noChanges");

function shortenKey(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 16 ? `${trimmed.slice(0, 8)}…${trimmed.slice(-6)}` : trimmed;
}

function formatKeyList(wallets: string[]): string {
  if (wallets.length === 0) {
    return i18n("noKeys");
  }
  return wallets.map(shortenKey).join(", ");
}

function formatAssetAmount(entry: StateAssetAmountForm): string {
  const isAda = entry.policyId.length === 0 && entry.assetName.length === 0;
  // An ADA row's form amount is ADA text, exactly as the editor's input holds it:
  // the datum's lovelace is converted into ADA on the way into the form and back on
  // encode. Running it through `formatLovelaceAsAda` divided by a million again, so
  // the review showed a person's 5 ₳ daily limit as "0.000005 ₳".
  return isAda
    ? `${entry.amount.trim() || "0"} ₳`
    : `${entry.amount} ${entry.assetName || entry.policyId}`;
}

function formatAllowance(entries: StateAssetAmountForm[]): string {
  if (entries.length === 0) {
    return i18n("noDailyLimit");
  }
  return entries.map(formatAssetAmount).join(" + ");
}

function formatOption(mode: "none" | "some", value: string, unset: string): string {
  return mode === "some" && value.trim().length > 0 ? value.trim() : unset;
}

function formatTimestamp(value: string): string {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return value.trim() || i18n("unset");
  }
  return defaultFormatter.dateTime(asNumber, "short");
}

function change(before: string, after: string): string {
  return `${before} → ${after}`;
}

// Every editable field must appear here: the collection diff detects an edit by
// comparing these strings, so a field left out changes the datum in silence.
function describeUser(user: UserFormState): string {
  const role = user.isAdmin ? i18n("owner") : i18n("spender");
  // Every segment after the role carries its label. Unlabeled, the line ended
  // "… cannot renew the timer · 0.000003 ₳" and the allowance — the one number
  // that is easy to misread, since it is counted in lovelace — had nothing to
  // say what it was; "power no vote" also named a ballot nobody could find in
  // the editor. The labels are what the person card calls each field.
  const power = formatOption(user.multiSigPowerMode, user.multiSigPower, i18n("none"));
  const checkIn = user.canRenewProofOfLife ? i18n("canCheckIn") : i18n("cannotCheckIn");
  const limit = formatAllowance(user.perDayAllowance);
  const limitSegment =
    user.perDayAllowance.length > 0 ? i18n("dailyLimitValue", { value: limit }) : limit;
  return i18n("userDescription", {
    role,
    keys: formatKeyList(user.wallets),
    power,
    checkIn,
    limit: limitSegment
  });
}

function describeBeneficiary(entry: BeneficiaryFormState): string {
  const wait =
    entry.unlockAfterMode === "some" && entry.unlockAfter.trim()
      ? i18n("afterValue", { value: formatTimestamp(entry.unlockAfter) })
      : i18n("noExtraWait");
  return i18n("beneficiaryDescription", {
    keys: formatKeyList(entry.wallets),
    weight: entry.weight || "1",
    wait
  });
}

function describeSchedule(entry: StreamingPaymentFormState): string {
  return i18n("scheduleDescription", {
    address: shortenKey(entry.payoutAddress),
    amount: formatLovelaceAsAda(entry.amountPerDay || "0"),
    start: formatTimestamp(entry.startDate),
    end: formatTimestamp(entry.endDate)
  });
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
      value: change(before.walletName.trim() || i18n("unnamed"), after.walletName.trim() || i18n("unnamed")),
      detail: i18n("onlyTheLabelYouSeeItChangesNothing")
    });
  }

  items.push(
    ...diffCollection(before.users, after.users, {
      label: i18n("person"),
      describe: describeUser,
      addedDetail: i18n("personAddedDetail"),
      removedDetail: i18n("personRemovedDetail"),
      changedDetail: i18n("personChangedDetail")
    })
  );

  const beforeThreshold = formatOption(
    before.multiSigThresholdMode,
    before.multiSigThreshold,
    i18n("anySingleOwner")
  );
  const afterThreshold = formatOption(
    after.multiSigThresholdMode,
    after.multiSigThreshold,
    i18n("anySingleOwner")
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
      addedDetail: i18n("recoveryContactAddedDetail"),
      removedDetail: i18n("recoveryContactRemovedDetail"),
      changedDetail: i18n("recoveryContactChangedDetail")
    })
  );

  const beforeUnlockOff = before.proofOfLifeUnlockTimeMode !== "some";
  const afterUnlockOff = after.proofOfLifeUnlockTimeMode !== "some";
  const beforeUnlock = formatOption(
    before.proofOfLifeUnlockTimeMode,
    before.proofOfLifeUnlockTime,
    i18n("off")
  );
  const afterUnlock = formatOption(
    after.proofOfLifeUnlockTimeMode,
    after.proofOfLifeUnlockTime,
    i18n("off")
  );
  if (beforeUnlock !== afterUnlock) {
    items.push({
      label: i18n("proofOfLife"),
      value: change(
        beforeUnlockOff ? i18n("off") : formatTimestamp(beforeUnlock),
        afterUnlockOff ? i18n("off") : formatTimestamp(afterUnlock)
      ),
      detail:
        afterUnlockOff
          ? i18n("recoveryContactsCanNeverClaimThisWalletWhile")
          : i18n("ifNoOwnerSignsBeforeThisMomentRecovery"),
      tone: "warning"
    });
  }

  const beforeIncrement = formatOption(
    before.proofOfLifeIncrementMode,
    before.proofOfLifeIncrement,
    i18n("unset")
  );
  const afterIncrement = formatOption(
    after.proofOfLifeIncrementMode,
    after.proofOfLifeIncrement,
    i18n("unset")
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
      addedDetail: i18n("scheduledPaymentAddedDetail"),
      removedDetail: i18n("scheduledPaymentRemovedDetail"),
      changedDetail: i18n("scheduledPaymentChangedDetail")
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
          value: i18n("nothingToApply"),
          detail: i18n("thisTransactionWouldRewriteTheWalletSRules")
        }
      ],
      isDiff: true
    };
  }

  return { items: diff, isDiff: true };
}
