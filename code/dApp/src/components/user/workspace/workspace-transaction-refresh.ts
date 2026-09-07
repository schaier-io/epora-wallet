import { workspaceSessionAtom } from "./atoms/transaction-flow.atoms";
import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";

// A just-submitted tx isn't confirmed yet when the immediate post-submit refresh
// runs, so it still reads pre-submit balance/UTxOs. Re-poll over ~75s so the
// wallet updates itself once the tx lands, so no manual Refresh is needed. The STT
// re-detect (keepSelection) refreshes datum-derived display after a state change
// without flashing the wallet during the gap.
const POST_SUBMIT_REFRESH_DELAYS_MS = [12_000, 30_000, 50_000, 75_000];

type PostSubmitRefreshDeps = Pick<
  WorkspaceTransactionsCtx,
  | "jotaiStore"
  | "postSubmitRefreshTimersRef"
  | "refreshLockedContractUtxos"
  | "refreshWalletBalance"
  | "refreshPermissionWalletSummaries"
  | "refreshDetectedTokens"
  | "lockingContract"
>;

export function schedulePostSubmitRefresh(deps: PostSubmitRefreshDeps): void {
  const session = deps.jotaiStore.get(workspaceSessionAtom);
  const isCurrent = () => deps.jotaiStore.get(workspaceSessionAtom) === session;
  deps.postSubmitRefreshTimersRef.current.forEach((id) => window.clearTimeout(id));
  deps.postSubmitRefreshTimersRef.current = POST_SUBMIT_REFRESH_DELAYS_MS.map((delay) =>
    window.setTimeout(() => {
      if (!isCurrent()) return;
      void Promise.allSettled([
        Promise.resolve().then(() =>
          isCurrent() ? deps.refreshLockedContractUtxos(deps.lockingContract.address) : undefined
        ),
        Promise.resolve().then(() => isCurrent() ? deps.refreshWalletBalance() : undefined),
        Promise.resolve().then(async () => {
          if (!isCurrent()) return;
          const detected = await deps.refreshDetectedTokens({ keepSelection: true });
          if (detected && isCurrent()) {
            await deps.refreshPermissionWalletSummaries(detected.tokens);
          }
        })
      ]);
    }, delay)
  );
}
