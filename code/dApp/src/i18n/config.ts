export const locales = ["en"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";
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
