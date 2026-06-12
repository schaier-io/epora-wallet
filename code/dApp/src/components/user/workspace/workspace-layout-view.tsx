"use client";

import { cn } from "@/lib/utils/cn";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { WorkspaceReviewRailView } from "@/components/user/workspace/workspace-review-rail-view";
import { WorkspaceMainPanelView } from "@/components/user/workspace/workspace-main-panel-view";
import { WorkspaceSidebarView } from "@/components/user/workspace/workspace-sidebar-view";

export function WorkspaceLayoutView() {
  const state = useWorkspaceActions();
  const {
    hasActiveComposer,
    showGuidedSidebar,
  } = state;

  return (
          <div
            className={cn(
              "grid min-h-0 flex-1 gap-4",
              showGuidedSidebar
                ? hasActiveComposer
                  ? "xl:grid-cols-[280px_minmax(0,1fr)_260px] 2xl:grid-cols-[300px_minmax(0,1fr)_280px]"
                  : "xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]"
                : hasActiveComposer
                  ? "xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]"
                  : "xl:grid-cols-1"
            )}
          >
            {showGuidedSidebar ? (
              <WorkspaceSidebarView />
            ) : null}

            <WorkspaceMainPanelView />

            {hasActiveComposer ? (
              <WorkspaceReviewRailView />
            ) : null}
          </div>
  );
}
