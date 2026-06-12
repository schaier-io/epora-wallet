"use client";
import { resolvedSelectedTaskAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { activeInferredSttStateFormAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { useAtomValue } from "jotai";

import {
  ChevronRight
} from "lucide-react";

import type {
  UserWorkspaceTask
} from "@/components/user/flow-types";

import {
  AnimatedContent,
  AnimatedList,
  SpotlightCard
} from "@/components/react-bits/primitives";
import { Badge } from "@/components/ui/badge";

import {
  countAdminUsersInStateForm
} from "@/lib/contracts/state-form";

import { cn } from "@/lib/utils/cn";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/constants";
import { GuidedAdminTaskTabs, SidebarActiveGlow } from "@/components/user/workspace/editors";
import { formatCountLabel } from "@/components/user/workspace/helpers";

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
  const state = useWorkspaceActions();
  const activeInferredSttStateForm = useAtomValue(activeInferredSttStateFormAtom);
  const resolvedSelectedTask = useAtomValue(resolvedSelectedTaskAtom);
  const {
    guidedAdminGroups,
    guidedStreamingPaymentTaskBadges,
    guidedAdminGroupBadgeText,
    guidedAdminGroupStatusText,
    guidedAdminGroupSummary,
    guidedStreamingPaymentsDisabledTasks,
    activeAdminGroupId,
    handleFocusedTaskSelect,
    openGuidedAdminGroup,
  } = state;
    if (guidedAdminGroups.length === 0) {
      return null;
    }

    return (
      <div className="space-y-2">
        <p className="px-1 pt-1 text-[11px] font-medium text-muted-foreground/70">
          Manage
        </p>
        <AnimatedList
          className="space-y-2"
          itemClassName="w-full"
          stagger={70}
          distance={18}
          reveal="mount"
        >
          {guidedAdminGroups.map((group) => {
            const isActive = activeAdminGroupId === group.id;
            const groupTasks = GUIDED_ADMIN_TASKS.filter((task) => task.group === group.id);
            const groupTaskBadges: Partial<Record<UserWorkspaceTask, string>> =
              group.id === "manage-people"
                ? {
                    "people-admins-signers": formatCountLabel(
                      countAdminUsersInStateForm(activeInferredSttStateForm),
                      "admin"
                    ),
                    "people-spending-users": formatCountLabel(
                      Math.max(
                        activeInferredSttStateForm.users.length -
                          countAdminUsersInStateForm(activeInferredSttStateForm),
                        0
                      ),
                      "user"
                    ),
                    "people-wallet-assignments": `${activeInferredSttStateForm.users.filter((user) => user.wallets.length > 0).length} linked`
                  }
                : group.id === "wallet-settings"
                  ? {
                      "settings-wallet-name": activeInferredSttStateForm.walletName,
                      "settings-beneficiaries": formatCountLabel(
                        activeInferredSttStateForm.beneficiaries.length,
                        "person",
                        "people"
                      ),
                      "settings-proof-of-life":
                        activeInferredSttStateForm.proofOfLifeUnlockTimeMode === "some"
                          ? "Set"
                          : "Unset",
                      "settings-multisig-threshold":
                        activeInferredSttStateForm.multiSigThresholdMode === "some"
                          ? "Set"
                          : "Off"
                    }
                  : guidedStreamingPaymentTaskBadges;

            return (
              <SpotlightCard
                key={group.id}
                className="min-w-0 rounded-2xl"
                spotlightColor="rgba(82, 255, 220, 0.14)"
              >
                {isActive ? <SidebarActiveGlow /> : null}
                <div
                  data-expanded={isActive ? "true" : undefined}
                  className={cn(
                    "user-surface user-card-lift user-sidebar-card relative z-10 min-w-0 overflow-hidden rounded-2xl border px-3.5 py-3.5 transition-[background-color,border-color,box-shadow,transform]",
                    isActive ? guidedSidebarActiveSurfaceClass : guidedSidebarIdleSurfaceClass
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openGuidedAdminGroup(group.id)}
                    aria-expanded={isActive}
                    className="flex w-full min-w-0 items-start justify-between gap-3 text-left"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3 overflow-hidden">
                      <span
                        className={cn(
                          guidedSidebarIconBaseClass,
                          isActive ? guidedSidebarIconActiveClass : guidedSidebarIconIdleClass
                        )}
                      >
                        <group.icon className="h-4.5 w-4.5" />
                      </span>
                      <div className={guidedSidebarTextClass}>
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
                        <p className={guidedSidebarDescriptionClass}>{group.description}</p>
                        {isActive ? (
                          <p className="user-sidebar-copy mt-2 text-xs leading-snug text-muted-foreground">
                            {guidedAdminGroupSummary[group.id]}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRight
                      className={cn(
                        guidedSidebarChevronClass,
                        isActive ? "text-emerald-100 opacity-100" : "text-muted-foreground opacity-50"
                      )}
                    />
                  </button>
                  {isActive ? (
                    <AnimatedContent
                      className="user-sidebar-expand mt-4 border-t border-border/60 pt-4"
                      distance={8}
                      duration={220}
                      scale={0.995}
                    >
                      <GuidedAdminTaskTabs
                        tasks={groupTasks}
                        selectedTask={resolvedSelectedTask}
                        onSelect={handleFocusedTaskSelect}
                        badgeByTask={groupTaskBadges}
                        disabledTaskIds={
                          group.id === "streamingPayments" ? guidedStreamingPaymentsDisabledTasks : []
                        }
                      />
                    </AnimatedContent>
                  ) : null}
                </div>
              </SpotlightCard>
            );
          })}
        </AnimatedList>
      </div>
    );
}
