"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PermissionWalletWorkspaceState } from "@/components/user/workspace/use-permission-wallet-workspace-state";

/**
 * The workspace ACTION surface: the imperative handlers (build/submit tx, navigation, refresh,
 * draft mutations), the shared refs, and the handler-bound derivations that genuinely can't be
 * atoms — `review`/`guided`/draft outputs depend on the `buildActionSignature` function, and the
 * permission-wallet cards need the smart-wallet-display provider. Everything that CAN be an atom
 * (state + pure derivations) now lives in `workspace/atoms/*` and is read directly by views via
 * `useAtomValue`; this context is what's left after dissolving the old `useWorkspaceState` god
 * barrel — the action layer, not a state dump.
 */
const WorkspaceActionsContext = createContext<PermissionWalletWorkspaceState | null>(null);

export function WorkspaceActionsProvider({
  value,
  children
}: {
  value: PermissionWalletWorkspaceState;
  children: ReactNode;
}) {
  return <WorkspaceActionsContext.Provider value={value}>{children}</WorkspaceActionsContext.Provider>;
}

export function useWorkspaceActions(): PermissionWalletWorkspaceState {
  const value = useContext(WorkspaceActionsContext);
  if (!value) {
    throw new Error("useWorkspaceActions must be used within a WorkspaceActionsProvider");
  }
  return value;
}
