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

export function writeRecentRecipientsToStorage(recipients: string[]) {
  safeLocalStorageSet(
    RECENT_RECIPIENTS_STORAGE_KEY,
    JSON.stringify(recipients)
  );
}
