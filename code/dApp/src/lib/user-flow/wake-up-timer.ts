import type { StateFormState } from "@/lib/contracts/state-form";

/**
 * How the wake-up timer reads on wallet home.
 *
 * The deadline used to exist in exactly one place: a single string inside a collapsed
 * disclosure, and only on the tabs that are *not* the tab where the timer is set. So the one
 * date that decides when recovery contacts can claim the wallet was invisible on the screen
 * the user actually looks at. This turns it into a tile the wallet home can render next to
 * owners, recovery contacts and schedules.
 */
export type WakeUpTimerSummary = {
  /** The tile headline. `null` means the timer is off and the empty branch renders. */
  value: string | null;
  /** Small text after the headline. Empty when the headline is already a sentence. */
  label: string;
  /** Used by the empty branch as `No {emptyLabel}`. */
  emptyLabel: string;
  cta: string;
  /** Expired, or close enough that the user should act now. Renders amber. */
  urgent: boolean;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Under a week left is close enough that a passing glance has to catch it. */
const URGENT_WINDOW_MS = 7 * DAY_MS;

const EMPTY_LABEL = "wake-up timer";

function formatRemaining(remainingMs: number): string {
  if (remainingMs < HOUR_MS) return "< 1 hour";
  if (remainingMs < 2 * DAY_MS) {
    const hours = Math.round(remainingMs / HOUR_MS);
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = Math.round(remainingMs / DAY_MS);
  return `${days} days`;
}

export function describeWakeUpTimer(
  form: Pick<StateFormState, "proofOfLifeUnlockTimeMode" | "proofOfLifeUnlockTime">,
  nowMs: number
): WakeUpTimerSummary {
  const unlockMs = Number(form.proofOfLifeUnlockTime);
  const armed =
    form.proofOfLifeUnlockTimeMode === "some" && Number.isFinite(unlockMs) && unlockMs > 0;

  if (!armed) {
    return {
      value: null,
      label: "",
      emptyLabel: EMPTY_LABEL,
      cta: "Set wake-up timer",
      urgent: false
    };
  }

  const remainingMs = unlockMs - nowMs;
  if (remainingMs <= 0) {
    // No countdown here: the number stopped mattering the moment it hit zero. What matters
    // is that recovery contacts can claim the wallet right now.
    return {
      value: "Ran out",
      label: "",
      emptyLabel: EMPTY_LABEL,
      cta: "Renew the timer",
      urgent: true
    };
  }

  return {
    value: formatRemaining(remainingMs),
    label: "left on the timer",
    emptyLabel: EMPTY_LABEL,
    cta: "Manage the timer",
    urgent: remainingMs <= URGENT_WINDOW_MS
  };
}
