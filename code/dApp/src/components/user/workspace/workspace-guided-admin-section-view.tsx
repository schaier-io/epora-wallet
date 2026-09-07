"use client";
import { useTranslations } from "next-intl";


import {
  ChevronRight
} from "lucide-react";




import {
  AnimatedList,
  SpotlightCard
} from "@/components/react-bits/primitives";
import { Badge } from "@/components/ui/badge";




import { cn } from "@/lib/utils/cn";
import { SidebarActiveGlow } from "@/components/user/workspace/editors";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import {
  guidedSidebarActiveSurfaceClass,
  guidedSidebarIdleSurfaceClass,
  guidedSidebarIconBaseClass,
  guidedSidebarIconActiveClass,
  guidedSidebarIconIdleClass,
  guidedSidebarTextClass,
  guidedSidebarTitleClass,
  guidedSidebarDescriptionClass,
  guidedSidebarChevronClass
} from "@/components/user/workspace/workspace-guided-sidebar-classes";

export function GuidedAdminSectionView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceGuidedAdminSectionView");
  const state = useWorkspaceActions();
  const {
    guidedAdminGroups,
    guidedAdminGroupBadgeText,
    guidedAdminGroupStatusText,
    activeAdminGroupId,
    openGuidedAdminGroup,
  } = state;
    if (guidedAdminGroups.length === 0) {
      return null;
    }

    return (
      <div className="space-y-2">
        <p className="eyebrow pt-1 font-medium text-muted-foreground/70">
          {i18n("manage")}
        </p>
        <AnimatedList
          className="space-y-2"
          itemClassName="w-full"
          stagger={45}
          distance={12}
          reveal="mount"
        >
          {guidedAdminGroups.map((group) => {
            const isActive = activeAdminGroupId === group.id;

            return (
              <SpotlightCard
                key={group.id}
                className="min-w-0 rounded-lg"
                spotlightColor="rgba(82, 255, 220, 0.14)"
              >
                {isActive ? <SidebarActiveGlow /> : null}
                <div
                  // `data-expanded` is only the CSS hook `globals.css:186` rotates the chevron
                  // with; a data attribute reaches no screen reader, so it does not undo the
                  // `aria-current` below. The name still describes the wrong thing -- it marks
                  // the active group, not an expanded one -- and renaming it means editing
                  // globals.css.
                  data-expanded={isActive ? "true" : undefined}
                  className={cn(
                    "user-surface user-card-lift user-sidebar-card relative z-10 min-w-0 overflow-hidden rounded-lg border p-3 transition-[background-color,border-color,box-shadow,transform]",
                    isActive ? guidedSidebarActiveSurfaceClass : guidedSidebarIdleSurfaceClass
                  )}
                >
                  {/* `aria-current`, not `aria-expanded`. Nothing expands here:
                      `openGuidedAdminGroup` (workspace-navigation.ts:304) forwards to
                      `handleFocusedTaskSelect` -> `openWorkspaceIntent`, which swaps the main
                      panel, and there is no region under this button to expand. The old
                      `aria-expanded` announced "collapsed"/"expanded" for a control that
                      navigates, and left the real state -- this is the group you are in --
                      exposed by colour and the chevron alone. Every other sidebar entry
                      already marks that state with `aria-current` (workspace-sidebar-view.tsx:115
                      and :163, workspace-guided-action-section-view.tsx:72). */}
                  <button
                    type="button"
                    onClick={() => openGuidedAdminGroup(group.id)}
                    aria-current={isActive ? "true" : undefined}
                    className="flex w-full min-w-0 items-start justify-between gap-3 text-left"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3 overflow-hidden">
                      <span
                        className={cn(
                          guidedSidebarIconBaseClass,
                          isActive ? guidedSidebarIconActiveClass : guidedSidebarIconIdleClass
                        )}
                      >
                        <group.icon className="h-4 w-4" />
                      </span>
                      <div className={guidedSidebarTextClass}>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className={guidedSidebarTitleClass}>{group.label}</p>
                          <Badge variant="outline" className="max-w-full truncate">
                            {guidedAdminGroupBadgeText[group.id]}
                          </Badge>
                          <Badge
                            className="max-w-full truncate"
                            variant={
                              guidedAdminGroupStatusText[group.id] === "Ready"
                                ? "secondary"
                                : guidedAdminGroupStatusText[group.id] === "Draft"
                                  ? "warning"
                                  : "outline"
                            }
                          >
                            {guidedAdminGroupStatusText[group.id]}
                          </Badge>
                        </div>
                        {/* One description line on active and idle cards alike: an
                            "active summary" sentence under this read as a near-duplicate
                            (the wallet-settings pair differed only by dropping "timer"). */}
                        <p className={guidedSidebarDescriptionClass}>{group.description}</p>
                      </div>
                    </div>
                    <ChevronRight
                      className={cn(
                        guidedSidebarChevronClass,
                        isActive ? "text-emerald-100 opacity-100" : "text-muted-foreground opacity-50"
                      )}
                    />
                  </button>
                </div>
              </SpotlightCard>
            );
          })}
        </AnimatedList>
      </div>
    );
}
