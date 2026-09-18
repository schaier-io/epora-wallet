import type {
  StateFormState,
  StateAssetAmountForm
} from "@/lib/contracts/state-form";

import { positiveAllowanceEntries } from "@/components/user/workspace/wallet-access-summary";

/**
 * One spend permission (an "agent": a user record with a positive per-day
 * allowance) as the spending console reads it.
 *
 * The numbers mirror the on-chain allowance rule in
 * `lib/contracts/use-allowance.ts::normalizeAllowance`: the per-day allowance
 * counts as available again only once the reset stamp has passed. Budget
 * changes are shown only once their transaction has confirmed, because this
 * reads the wallet's confirmed state form, never a draft.
 */
export type AgentBudgetAsset = {
  policyId: string;
  assetName: string;
  /** Configured per-day limit, as decimal text exactly as the record stores it. */
  limit: string;
  /** Available now after the reset rule; `null` when the stored remaining cannot be read. */
  remaining: string | null;
  /** Limit minus remaining for the current window, floored at zero; `null` when unknown. */
  spent: string | null;
};

export type AgentBudgetResetState =
  | { kind: "reset-due" }
  | { kind: "reset-scheduled"; resetAtMs: number }
  | { kind: "reset-unknown" };

export type AgentBudget = {
  userId: string;
  recordIndex: number;
  wallets: string[];
  isAdmin: boolean;
  assets: AgentBudgetAsset[];
  status: "available" | "exhausted";
  reset: AgentBudgetResetState;
};

/** The comparison mirrors the on-chain anchor: the reset counts once its stamp has passed. */
function readResetState(nextAllowanceReset: string, nowMs: number): AgentBudgetResetState {
  const normalized = nextAllowanceReset.trim();
  if (!/^\d+$/.test(normalized) || normalized === "0") {
    return { kind: "reset-unknown" };
  }

  const resetAtMs = BigInt(normalized);
  if (resetAtMs <= BigInt(nowMs)) {
    return { kind: "reset-due" };
  }

  // Epoch milliseconds fit a safe integer until the year 287396; anything wider
  // would corrupt the display date, so an absurd stamp degrades to "unknown".
  const asNumber = Number(resetAtMs);
  return Number.isSafeInteger(asNumber)
    ? { kind: "reset-scheduled", resetAtMs: asNumber }
    : { kind: "reset-unknown" };
}

type ParsedDecimal = { whole: bigint; fraction: bigint; fractionDigits: number };

function parseDecimalText(text: string): ParsedDecimal | null {
  const normalized = text.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return null;
  const fractionDigits = (match[2] ?? "").length;
  return {
    whole: BigInt(match[1]),
    fraction: BigInt(match[2] ?? "0"),
    fractionDigits
  };
}

function scaleTo(parsed: ParsedDecimal, fractionDigits: number): bigint {
  const padding = BigInt(10) ** BigInt(fractionDigits - parsed.fractionDigits);
  return parsed.whole * BigInt(10) ** BigInt(fractionDigits) + parsed.fraction * padding;
}

/** Decimal text for a scaled value, with trailing zeros trimmed ("5.25", "3500"). */
function formatScaled(value: bigint, fractionDigits: number): string {
  if (fractionDigits === 0) return value.toString();
  const scale = BigInt(10) ** BigInt(fractionDigits);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(fractionDigits, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${whole}.${fraction}` : `${whole}`;
}

/** Exact decimal subtraction on text amounts; `null` for anything unreadable. */
function subtractDecimalText(minuend: string, subtrahend: string): string | null {
  const left = parseDecimalText(minuend);
  const right = parseDecimalText(subtrahend);
  if (!left || !right) return null;
  const fractionDigits = Math.max(left.fractionDigits, right.fractionDigits);
  const difference = scaleTo(left, fractionDigits) - scaleTo(right, fractionDigits);
  // Remaining above the limit (a top-up mid-window) is not negative spending.
  return formatScaled(difference < 0n ? 0n : difference, fractionDigits);
}

function assetKey(entry: StateAssetAmountForm) {
  return `${entry.policyId.trim()}.${entry.assetName.trim()}`;
}

export function deriveAgentBudgets(state: StateFormState, nowMs: number): AgentBudget[] {
  return state.users.flatMap((user, recordIndex) => {
    const limits = positiveAllowanceEntries(user);
    if (limits.length === 0) return [];

    const reset = readResetState(user.nextAllowanceReset, nowMs);
    const remainingByKey = new Map(
      user.remainingAllowance.map((entry) => [assetKey(entry), entry])
    );

    type WorkingAsset = AgentBudgetAsset & { exhausted: boolean };
    const assets: WorkingAsset[] = limits.map((limit) => {
      const remainingEntry = remainingByKey.get(assetKey(limit));
      // Reset due: the on-chain rule serves the full per-day allowance again.
      const remainingText =
        reset.kind === "reset-due"
          ? limit.amount
          : (remainingEntry?.amount ?? "0");
      const parsedRemaining = parseDecimalText(remainingText);
      const remaining = parsedRemaining ? remainingText : null;
      const spent =
        remaining === null ? null : subtractDecimalText(limit.amount, remainingText);

      return {
        policyId: limit.policyId,
        assetName: limit.assetName,
        limit: limit.amount,
        remaining,
        spent,
        exhausted:
          parsedRemaining !== null &&
          parsedRemaining.whole === 0n &&
          parsedRemaining.fraction === 0n
      };
    });

    const exhausted = assets.every((asset) => asset.exhausted);
    const publicAssets: AgentBudgetAsset[] = assets.map(({ exhausted: _, ...asset }) => asset);

    return [
      {
        userId: user.id,
        recordIndex,
        wallets: [...user.wallets],
        isAdmin: user.isAdmin,
        assets: publicAssets,
        status: exhausted ? "exhausted" : "available",
        reset
      }
    ];
  });
}
