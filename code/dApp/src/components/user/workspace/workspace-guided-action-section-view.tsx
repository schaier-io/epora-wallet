"use client";
import { selectedIntentAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { useAtomValue } from "jotai";

import {
  ChevronRight
} from "lucide-react";
import {
  USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";

import {
  AnimatedList,
  SpotlightCard
} from "@/components/react-bits/primitives";

import { cn } from "@/lib/utils/cn";
import { SidebarActiveGlow } from "@/components/user/workspace/editors";
import { type GuidedActionCard } from "@/components/user/workspace/types";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import {
  guidedSidebarActiveSurfaceClass,
  guidedSidebarIdleSurfaceClass,
  guidedSidebarIconBaseClass,
  guidedSidebarIconActiveClass,
  guidedSidebarIconIdleClass,
  guidedSidebarButtonClass,
  guidedSidebarSpotlightClass,
  guidedSidebarTextClass,
  guidedSidebarTitleClass,
  guidedSidebarChevronClass
} from "@/components/user/workspace/workspace-guided-sidebar-classes";

export function GuidedActionSectionView({ title, actions }: { title: string | null; actions: GuidedActionCard[] }) {
  const state = useWorkspaceActions();
  const selectedIntent = useAtomValue(selectedIntentAtom);
  const {
    openWorkspaceIntent,
  } = state;
    if (actions.length === 0) {
      return null;
    }

    return (
      <div className="space-y-2">
        {title ? (
          <p className="eyebrow pt-1 font-medium text-muted-foreground/70">
            {title}
          </p>
        ) : null}
        <AnimatedList
          className="space-y-2"
          itemClassName="w-full"
          stagger={45}
          distance={12}
          reveal="mount"
        >
          {actions.map((entry) => {
            const isActive = selectedIntent === entry.intent;
            const DefinitionIcon = USER_ACTION_DEFINITION_MAP[entry.action].icon;

            return (
              <SpotlightCard
                key={`${entry.intent}-${entry.action}`}
                className={guidedSidebarSpotlightClass}
                spotlightColor="rgba(82, 255, 220, 0.16)"
              >
                {isActive ? <SidebarActiveGlow /> : null}
                <button
                  type="button"
                  onClick={() => openWorkspaceIntent(entry.intent, entry.action, entry.task)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    guidedSidebarButtonClass,
                    isActive ? guidedSidebarActiveSurfaceClass : guidedSidebarIdleSurfaceClass
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                    <span
                      className={cn(
                        guidedSidebarIconBaseClass,
                        isActive ? guidedSidebarIconActiveClass : guidedSidebarIconIdleClass
                      )}
                    >
                      <DefinitionIcon className="h-4 w-4" />
                    </span>
                    <div className={guidedSidebarTextClass}>
                      {/*
                        Title only. Every entry here carried a sentence that restated its
                        own label ("Send funds" / "Normal wallet send."), which tripled the
                        height of the action list for no information.
                      */}
                      <p className={guidedSidebarTitleClass}>{entry.title}</p>
                    </div>
                  </div>
                  <ChevronRight
                    className={cn(
                      guidedSidebarChevronClass,
                      isActive ? "opacity-100 text-emerald-100" : "opacity-35 text-muted-foreground"
                    )}
                  />
                </button>
              </SpotlightCard>
            );
          })}
        </AnimatedList>
      </div>
    );
}
