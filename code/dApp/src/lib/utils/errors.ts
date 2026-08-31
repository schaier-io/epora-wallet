// Canonical unknown→message extraction. Use this instead of hand-rolling
// `error instanceof Error ? error.message : "…"` at call sites.
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

/**
 * Converts unknown provider/network failures into copy that helps a user recover
 * without exposing implementation details. Domain validation should keep using
 * `extractErrorMessage` when its messages are intentionally written for users.
 */
export function getUserFacingErrorMessage(error: unknown, fallback: string): string {
  const message = extractErrorMessage(error, "").trim();

  if (
    /(?:user|request).*(?:reject|declin|deni|cancel)|(?:reject|declin|deni|cancel).*(?:user|request)|\b4001\b/i.test(
      message
    )
  ) {
    return i18n("requestCancelled");
  }

  if (
    /network|failed to fetch|fetch failed|load failed|timeout|timed out|offline|connection|econn|socket/i.test(
      message
    )
  ) {
    return i18n("networkFailure", { fallback });
  }

  return fallback;
}
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibUtilsErrors.json";

const i18n = createDefaultTranslator("LibUtilsErrors", defaultMessages);
