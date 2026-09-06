import { RECENT_RECIPIENTS_STORAGE_KEY } from "@/components/user/workspace/constants";
import { safeLocalStorageSet } from "@/lib/wallet/storage";

export function readRecentRecipientsFromStorage() {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(RECENT_RECIPIENTS_STORAGE_KEY) ?? "[]"
    );
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [] as string[];
  }
}

// This write runs from a jotai updater inside the submit try, after the hash is
// already on chain (workspace-transaction-submit.ts). `setItem` throws when the
// browser blocks site data or the quota is full, so an unguarded write turned a
// successful send into a "submit failed" screen and skipped every post-submit
// refresh. Losing the recent-recipient list is the right trade against that.
export function writeRecentRecipientsToStorage(recipients: string[]) {
  safeLocalStorageSet(RECENT_RECIPIENTS_STORAGE_KEY, JSON.stringify(recipients));
}
