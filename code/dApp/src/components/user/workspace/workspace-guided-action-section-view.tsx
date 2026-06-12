"use client";
import { selectedIntentAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { useAtomValue } from "jotai";

import {
  ChevronRight
} from "lucide-react";
import {
  USER_ACTION_DEFINITION_MAP } from "@/components/user/flow-config";

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
  guidedSidebarTextClass,
  guidedSidebarTitleClass,
  guidedSidebarDescriptionClass,
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
          <p className="px-1 pt-1 text-[11px] font-medium text-muted-foreground/70">
            {title}
          </p>
        ) : null}
        <AnimatedList
          className="space-y-2"
          itemClassName="w-full"
          stagger={55}
          distance={16}
          reveal="mount"
        >
          {actions.map((entry) => {
            const isActive = selectedIntent === entry.intent;
            const DefinitionIcon = USER_ACTION_DEFINITION_MAP[entry.action].icon;

            return (
              <SpotlightCard
                key={`${entry.intent}-${entry.action}`}
                className="min-w-0 rounded-2xl"
                spotlightColor="rgba(82, 255, 220, 0.16)"
              >
                {isActive ? <SidebarActiveGlow /> : null}
                <button
                  type="button"
                  onClick={() => openWorkspaceIntent(entry.intent, entry.action)}
                  className={cn(
                    guidedSidebarButtonClass,
                    isActive ? guidedSidebarActiveSurfaceClass : guidedSidebarIdleSurfaceClass
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3 overflow-hidden">
                    <span
                      className={cn(
                        guidedSidebarIconBaseClass,
                        isActive ? guidedSidebarIconActiveClass : guidedSidebarIconIdleClass
                      )}
                    >
                      <DefinitionIcon className="h-4 w-4" />
                    </span>
                    <div className={guidedSidebarTextClass}>
                      <p className={guidedSidebarTitleClass}>{entry.title}</p>
                      <p className={guidedSidebarDescriptionClass}>{entry.description}</p>
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
