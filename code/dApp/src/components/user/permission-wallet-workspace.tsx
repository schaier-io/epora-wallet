"use client";

import { usePermissionWalletWorkspaceState } from "@/components/user/workspace/use-permission-wallet-workspace-state";
import { WorkspaceActionsProvider } from "@/components/user/workspace/workspace-actions-context";
import { WorkspaceView } from "@/components/user/workspace/workspace-view";

// Orchestration shell: all workspace state/logic lives in the
// `usePermissionWalletWorkspaceState` controller hook, and the entire render
// tree in `WorkspaceView`, wired together through `WorkspaceActionsContext`. This
// keeps the previously ~8k-line god component split by responsibility.
export function PermissionWalletWorkspace() {
  const state = usePermissionWalletWorkspaceState();
  return (
    <WorkspaceActionsProvider value={state}>
      <WorkspaceView />
    </WorkspaceActionsProvider>
  );
}
