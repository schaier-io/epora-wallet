import type { useStore } from "jotai";
import type { useDetectedSttTokens } from "./use-detected-stt-tokens";
import type { useLockedContractUtxos } from "./use-locked-contract-utxos";
import type { useWalletActivity } from "./use-wallet-activity";
import { workspaceSessionAtom } from "./atoms/transaction-flow.atoms";

type WorkspaceSummaryRefreshDeps = {
  jotaiStore: ReturnType<typeof useStore>;
  walletAddress: string | null;
  refreshLockedContractUtxos: ReturnType<typeof useLockedContractUtxos>["refreshLockedContractUtxos"];
  refreshPermissionWalletSummaries: ReturnType<typeof useDetectedSttTokens>["refreshPermissionWalletSummaries"];
  refreshWalletTransactions: ReturnType<typeof useWalletActivity>["refreshWalletTransactions"];
};

export async function refreshWorkspaceSummary(deps: WorkspaceSummaryRefreshDeps, includeWalletTransactions: boolean) {
  const session = deps.jotaiStore.get(workspaceSessionAtom);
  // Both readers join the same pending Query request for the selected address.
  await Promise.all([
    deps.refreshLockedContractUtxos(deps.walletAddress),
    deps.refreshPermissionWalletSummaries()
  ]);
  if (includeWalletTransactions && deps.walletAddress && deps.jotaiStore.get(workspaceSessionAtom) === session) {
    await deps.refreshWalletTransactions();
  }
}
