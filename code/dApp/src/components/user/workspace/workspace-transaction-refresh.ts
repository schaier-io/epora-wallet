import { queryClientAtom } from "jotai-tanstack-query";
import { invalidateChainQueries } from "@/lib/query/invalidation";
import { workspaceSessionAtom } from "./atoms/transaction-flow.atoms";
import type { WorkspaceTransactionsCtx } from "./workspace-transactions-types";

// Indexers may lag submission. All observers share each refresh, including rewards and activity.
const POST_SUBMIT_REFRESH_DELAYS_MS = [12_000, 30_000, 50_000, 75_000];

type PostSubmitRefreshDeps = Pick<WorkspaceTransactionsCtx, "jotaiStore" | "postSubmitRefreshTimersRef">;

export function schedulePostSubmitRefresh(deps: PostSubmitRefreshDeps): void {
  const session = deps.jotaiStore.get(workspaceSessionAtom);
  const client = deps.jotaiStore.get(queryClientAtom);
  deps.postSubmitRefreshTimersRef.current.forEach(id => window.clearTimeout(id));
  deps.postSubmitRefreshTimersRef.current = POST_SUBMIT_REFRESH_DELAYS_MS.map(delay =>
    window.setTimeout(() => {
      if (deps.jotaiStore.get(workspaceSessionAtom) !== session) return;
      void invalidateChainQueries(client).catch(error => console.error("[post-submit:refresh]", error));
    }, delay)
  );
}
