import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";

// A just-submitted tx isn't confirmed yet when the immediate post-submit refresh
// runs, so it still reads pre-submit balance/UTxOs. Re-poll over ~75s so the
// wallet updates itself once the tx lands — no manual Refresh needed. The STT
// re-detect (keepSelection) refreshes datum-derived display after a state change
// without flashing the wallet during the gap.
const POST_SUBMIT_REFRESH_DELAYS_MS = [12_000, 30_000, 50_000, 75_000];

type PostSubmitRefreshDeps = Pick<
  WorkspaceTransactionsCtx,
  | "postSubmitRefreshTimersRef"
  | "refreshLockedContractUtxos"
  | "refreshWalletBalance"
  | "refreshPermissionWalletSummaries"
  | "refreshDetectedTokens"
  | "lockingContract"
>;

export function schedulePostSubmitRefresh(deps: PostSubmitRefreshDeps): void {
  deps.postSubmitRefreshTimersRef.current.forEach((id) => window.clearTimeout(id));
  deps.postSubmitRefreshTimersRef.current = POST_SUBMIT_REFRESH_DELAYS_MS.map((delay) =>
    window.setTimeout(() => {
      void deps.refreshLockedContractUtxos(deps.lockingContract.address);
      void deps.refreshWalletBalance();
      void deps.refreshPermissionWalletSummaries();
      void deps.refreshDetectedTokens({ keepSelection: true });
    }, delay)
  );
}
