import type { useStore } from "jotai";
import type { useDetectedSttTokens } from "./use-detected-stt-tokens";
import type { useLockedContractUtxos } from "./use-locked-contract-utxos";
import type { useWalletActivity } from "./use-wallet-activity";
import { lockingContractAtom } from "./queries/wallet-identity.atoms";
import { workspaceSessionAtom } from "./atoms/transaction-flow.atoms";

type WorkspaceSummaryRefreshDeps = {
  jotaiStore: ReturnType<typeof useStore>;
  walletAddress: string | null;
  refreshLockedContractUtxos: ReturnType<typeof useLockedContractUtxos>["refreshLockedContractUtxos"];
  refreshPermissionWalletSummaries: ReturnType<typeof useDetectedSttTokens>["refreshPermissionWalletSummaries"];
  refreshDetectedTokens?: ReturnType<typeof useDetectedSttTokens>["refreshDetectedTokens"];
  refreshWalletTransactions: ReturnType<typeof useWalletActivity>["refreshWalletTransactions"];
};

export async function refreshWorkspaceSummary(deps: WorkspaceSummaryRefreshDeps, includeWalletTransactions: boolean) {
  const session = deps.jotaiStore.get(workspaceSessionAtom);
  await deps.refreshDetectedTokens?.({ keepSelection: true });
  if (deps.jotaiStore.get(workspaceSessionAtom) !== session) return;
  const walletAddress = deps.jotaiStore.get(lockingContractAtom).address;
  // Both readers join the same pending Query request for the selected address.
  const results = await Promise.all([
    deps.refreshLockedContractUtxos(walletAddress),
    deps.refreshPermissionWalletSummaries()
  ]);
  if (results.some(result => result === false)) throw new Error("Could not refresh wallet chain state.");
  if (includeWalletTransactions && walletAddress && deps.jotaiStore.get(workspaceSessionAtom) === session) {
    await deps.refreshWalletTransactions();
  }
}
