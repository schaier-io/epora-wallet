import { RECENT_RECIPIENTS_STORAGE_KEY } from "@/components/user/workspace/constants";

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
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    RECENT_RECIPIENTS_STORAGE_KEY,
    JSON.stringify(recipients)
  );
}

