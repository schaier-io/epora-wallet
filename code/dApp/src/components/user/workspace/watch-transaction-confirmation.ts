import type { createStore } from "jotai/vanilla";
import type { UserActionKind } from "@/components/user/flow-types";
import { queryClientAtom } from "jotai-tanstack-query";
import { txInfoQueryOptions } from "@/lib/query/chain";
import { invalidateChainQueries } from "@/lib/query/invalidation";
import { workspaceSessionAtom, submitHashAtom, submitConfirmedAtom, submitConfirmationUnseenAtom } from "./atoms/transaction-flow.atoms";
import { SUBMIT_CONFIRMATION_INITIAL_DELAY_MS, SUBMIT_CONFIRMATION_LATE_MAX_ATTEMPTS, SUBMIT_CONFIRMATION_LATE_POLL_MS, SUBMIT_CONFIRMATION_MAX_ATTEMPTS, SUBMIT_CONFIRMATION_POLL_MS } from "./constants";
import { waitFor } from "@/components/user/workspace/helpers";

  /**
   * The review rail's submitted banner promises "your balance updates after the
   * next block", but nothing ever told it when the block arrived, so the spinner
   * span forever. Poll a bounded number of times until an indexer sees the hash,
   * then flip the banner to confirmed and pull the balance once more.
   */
export async function watchTransactionConfirmation(jotaiStore: ReturnType<typeof createStore>, txHash: string, selectedAction: UserActionKind) {
    const session = jotaiStore.get(workspaceSessionAtom);
    const isCurrent = () => jotaiStore.get(workspaceSessionAtom) === session && jotaiStore.get(submitHashAtom) === txHash;
    const client = jotaiStore.get(queryClientAtom);
    const seenOnChain = () =>
      client.fetchQuery({ ...txInfoQueryOptions(txHash), retry: false }).catch(() => null);
    for (let attempt = 1; attempt <= SUBMIT_CONFIRMATION_MAX_ATTEMPTS; attempt += 1) {
      await waitFor(
        attempt === 1 ? SUBMIT_CONFIRMATION_INITIAL_DELAY_MS : SUBMIT_CONFIRMATION_POLL_MS
      );

      // Only a wallet or session change retires this run. "Done", a newer build or
      // a reset clears the banner, but balances must still refresh when the tx lands.
      if (jotaiStore.get(workspaceSessionAtom) !== session) return;

      const confirmed = await seenOnChain();
      if (!confirmed) {
        continue;
      }

      if (jotaiStore.get(workspaceSessionAtom) !== session) return;
      if (isCurrent()) jotaiStore.set(submitConfirmedAtom, true);
      await invalidateChainQueries(client);
      return;
    }

    // The poll ran out without the indexer seeing the hash: indexer lag, or the tx
    // lost an input race. Say so. Without this write the banner's spinner ran on
    // with no third state to land in. Only while the banner still shows this hash.
    if (!isCurrent()) return;
    jotaiStore.set(submitConfirmationUnseenAtom, true);

    // Keep looking, slower: a tx the indexers see after the window must still turn
    // the banner green. It stops as soon as "Done", a new build, or a reset
    // replaces the hash. Not for mint: its overlay runs its own confirmation
    // watch, and its locked "Done" never clears the hash to stop this loop.
    if (selectedAction === "mint") return;
    for (let attempt = 1; attempt <= SUBMIT_CONFIRMATION_LATE_MAX_ATTEMPTS; attempt += 1) {
      await waitFor(SUBMIT_CONFIRMATION_LATE_POLL_MS);
      if (!isCurrent()) return;
      if (!(await seenOnChain())) continue;
      if (isCurrent()) {
        jotaiStore.set(submitConfirmationUnseenAtom, false);
        jotaiStore.set(submitConfirmedAtom, true);
        await invalidateChainQueries(client);
      }
      return;
    }
  }
