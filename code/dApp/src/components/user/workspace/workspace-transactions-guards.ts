import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";

// Narrows the connected wallet to non-null at the point a builder actually runs.
// The build closures only fire from UI that already requires a connected wallet,
// so this throws (with a clear message) rather than passing a null wallet into a
// transaction builder — replacing the scattered `activeWallet!` assertions.
export function requireActiveWallet(
  activeWallet: WorkspaceTransactionsCtx["activeWallet"]
): NonNullable<WorkspaceTransactionsCtx["activeWallet"]> {
  if (!activeWallet) {
    throw new Error(
      "No wallet is connected. Connect a wallet before building a transaction."
    );
  }
  return activeWallet;
}
