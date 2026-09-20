export const locales = ["en"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";
/**
 * Fixed, not the reader's. The server renders the first HTML and the browser
 * hydrates it, so a zone read from the browser would make the two disagree and
 * React would throw a hydration mismatch. Everything formatted through
 * `formats.dateTime` therefore lands in this zone on both sides. The cost is
 * that a rendered time is not the reader's wall clock, which is why any time a
 * reader has to act on uses `shortWithZone` and says which zone it is in.
 */
export const defaultTimeZone = "UTC";

export const localeCookieName = "NEXT_LOCALE";

export const formats = {
  dateTime: {
    short: {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    },
    // Same as `short`, plus the zone. Use this wherever the reader makes a
    // decision on the time: a deadline, a review-rail diff, a stored timestamp
    // echoed back beside a date and time input. Those inputs are filled and read
    // in `defaultTimeZone`, not in the reader's own zone (see
    // `lib/user-flow/time-inputs.ts`), so the echo has to name the zone it is on.
    shortWithZone: {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short"
    },
    date: {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  },
  number: {
    integer: {
      maximumFractionDigits: 0
    },
    ada: {
      maximumFractionDigits: 6
    }
  }
} as const;

export function isAppLocale(value: string): value is AppLocale {
  return locales.includes(value as AppLocale);
}

export function resolveAppLocale(...candidates: Array<string | null | undefined>): AppLocale {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = candidate.trim().toLowerCase();
    if (isAppLocale(normalized)) return normalized;

    const baseLocale = normalized.split("-")[0];
    if (baseLocale && isAppLocale(baseLocale)) return baseLocale;
  }

  return defaultLocale;
}

export function readPreferredLanguage(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null;

  const preferred = acceptLanguage
    .split(",")
    .map((entry) => {
      const [language, ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
      const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
      return { language: language?.trim() ?? "", quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.language && entry.language !== "*")
    .toSorted((left, right) => right.quality - left.quality)[0];

  return preferred?.language ?? null;
}
