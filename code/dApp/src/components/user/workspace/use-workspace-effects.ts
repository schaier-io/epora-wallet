"use client";
import { useWorkspaceDisplayEffects, type WorkspaceDisplayEffectsCtx } from "@/components/user/workspace/use-workspace-display-effects";
import { useWorkspaceReconcileEffects, type WorkspaceReconcileEffectsCtx } from "@/components/user/workspace/use-workspace-reconcile-effects";
import { useWorkspaceSessionResetEffects, type WorkspaceSessionResetEffectsCtx } from "@/components/user/workspace/use-workspace-session-reset-effects";
import { useWorkspaceWizardEffects, type WorkspaceWizardEffectsCtx } from "@/components/user/workspace/use-workspace-wizard-effects";
import { useWorkspaceWalletSessionEffects, type WorkspaceWalletSessionEffectsCtx } from "@/components/user/workspace/use-workspace-wallet-session-effects";
import { useWorkspacePostSubmitEffects, type WorkspacePostSubmitEffectsCtx } from "@/components/user/workspace/use-workspace-post-submit-effects";
import { useWorkspaceSendActionEffects, type WorkspaceSendActionEffectsCtx } from "@/components/user/workspace/use-workspace-send-action-effects";
import { useWorkspaceGuidedEffects, type WorkspaceGuidedEffectsCtx } from "@/components/user/workspace/use-workspace-guided-effects";

/**
 * Composes all eight workspace effect hooks behind a single call. Each effect hook owns a
 * cohesive slice of the controller's side effects (display sync, form reconciliation, wallet-
 * session, wizard/route, post-submit, etc.); they self-source form/config/route state from atoms
 * and take the rest via ctx. The ctx here is the intersection of all eight effect ctx types, so
 * the whole object is passed to each (a superset is structurally assignable to each subset).
 */
export type WorkspaceEffectsCtx = WorkspaceDisplayEffectsCtx &
  WorkspaceReconcileEffectsCtx &
  WorkspaceSessionResetEffectsCtx &
  WorkspaceWizardEffectsCtx &
  WorkspaceWalletSessionEffectsCtx &
  WorkspacePostSubmitEffectsCtx &
  WorkspaceSendActionEffectsCtx &
  WorkspaceGuidedEffectsCtx;

export function useWorkspaceEffects(ctx: WorkspaceEffectsCtx): void {
  useWorkspaceDisplayEffects(ctx);
  useWorkspaceReconcileEffects(ctx);
  useWorkspaceSessionResetEffects(ctx);
  useWorkspaceWizardEffects(ctx);
  useWorkspaceWalletSessionEffects(ctx);
  useWorkspacePostSubmitEffects(ctx);
  useWorkspaceSendActionEffects(ctx);
  useWorkspaceGuidedEffects(ctx);
}
