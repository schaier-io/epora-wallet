import { useCallback, useEffect } from "react";
import { useStore } from "jotai";
import { rememberRecentRecipient } from "@/lib/user-flow/guided-helpers";
import {
  readRecentRecipientsFromStorage,
  writeRecentRecipientsToStorage
} from "@/components/user/workspace/helpers";
import { recentRecipientsAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";

export type RecentRecipientsController = {
  /** Record a single recipient address and persist the updated list. */
  rememberRecipient: (address: string) => void;
  /** Record several recipient addresses in one pass and persist once. */
  rememberRecipients: (addresses: string[]) => void;
};

/**
 * Owns the "recent send recipients" slice: a localStorage-backed list that is read once after
 * hydration and re-persisted whenever a new recipient is used. The list itself lives in
 * {@link recentRecipientsAtom} so views read it directly via `useAtomValue`; this hook seeds it
 * from storage on mount and exposes the record actions.
 */
export function useRecentRecipients(): RecentRecipientsController {
  const store = useStore();

  useEffect(() => {
    // Post-hydration localStorage read (kept in an effect to avoid an SSR
    // hydration mismatch from touching storage during render).
    store.set(recentRecipientsAtom, readRecentRecipientsFromStorage());
  }, [store]);

  const rememberRecipients = useCallback(
    (addresses: string[]) => {
      const next = addresses.reduce(
        (accumulator, address) => rememberRecentRecipient(accumulator, address),
        store.get(recentRecipientsAtom)
      );
      store.set(recentRecipientsAtom, next);
      writeRecentRecipientsToStorage(next);
    },
    [store]
  );

  const rememberRecipient = useCallback(
    (address: string) => rememberRecipients([address]),
    [rememberRecipients]
  );

  return { rememberRecipient, rememberRecipients };
}
