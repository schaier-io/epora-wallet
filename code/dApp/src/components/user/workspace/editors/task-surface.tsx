"use client";
import { useTranslations } from "next-intl";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { type UserWorkspaceTask } from "@/components/user/flow-types";
import { LONG_DESCRIPTION_LIMIT } from "@/components/user/workspace/constants";
import { formatCountLabel } from "@/components/user/workspace/helpers";
import { type GuidedAdminTaskDefinition } from "@/components/user/workspace/types";
import { cn } from "@/lib/utils/cn";
import { type LucideIcon, Plus } from "lucide-react";
import { type ReactNode } from "react";

export function TaskEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsTaskSurface");
  const descriptionIsLong = description.length > LONG_DESCRIPTION_LIMIT;

  return (
    <div className="user-surface rounded-lg border border-dashed border-border/60 bg-background/30 p-3 sm:p-4 text-center">
      {/* Block-level, not inline-flex: two inline boxes flowed onto one text line
          beside the title (no gap, baseline-aligned) whenever the title was short. */}
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-border/70 bg-background/60 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-foreground">
        {title}
        {descriptionIsLong ? (
          <InfoHint label={i18n("moreAboutTitle", { title: title })} contentClassName="max-w-sm">
            {description}
          </InfoHint>
        ) : null}
      </p>
      {!descriptionIsLong ? (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={onAction}>
            <Plus className="h-4 w-4" />
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function GuidedAdminTaskTabs({
  tasks,
  selectedTask,
  onSelect,
  badgeByTask = {},
  disabledTaskIds = [],
  disabledReasonByTask = {}
}: {
  tasks: GuidedAdminTaskDefinition[];
  selectedTask: UserWorkspaceTask | null;
  onSelect: (task: UserWorkspaceTask) => void;
  badgeByTask?: Partial<Record<UserWorkspaceTask, string>>;
  disabledTaskIds?: UserWorkspaceTask[];
  disabledReasonByTask?: Partial<Record<UserWorkspaceTask, string>>;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsTaskSurface");
  return (
    <div className="flex flex-wrap gap-2">
      {tasks.map((task) => {
        const Icon = task.icon;
        const isActive = selectedTask === task.id;
        const isDisabled = disabledTaskIds.includes(task.id);
        const badge = badgeByTask[task.id];
        const disabledReason = isDisabled ? disabledReasonByTask[task.id] : undefined;
        // The visible text is a truncated `shortLabel` plus a badge, so the accessible
        // name was a fragment. Spell out the full label, what the badge says, and, when
        // the tab is off, why.
        const accessibleName = [task.label, badge, disabledReason]
          .filter(Boolean)
          .join(". ");

        return (
          <button
            key={task.id}
            type="button"
            onClick={() => onSelect(task.id)}
            disabled={isDisabled}
            aria-label={accessibleName}
            title={disabledReason ? i18n("value1Disabledreason", { value1: task.label, disabledReason: disabledReason }) : task.label}
            className={cn(
              "user-surface user-task-chip inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border px-3 py-2 text-left text-sm transition-[background-color,border-color,color,box-shadow,transform]",
              isActive
                ? "border-primary/45 bg-primary/12 text-foreground shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_18%,transparent)]"
                : "border-border/70 bg-background/40 text-muted-foreground hover:border-primary/30 hover:text-foreground",
              isDisabled && "cursor-not-allowed opacity-45"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate font-medium">{task.shortLabel}</span>
            {badge ? (
              <span className="max-w-[7.5rem] shrink truncate rounded-full border border-border/60 bg-background/60 px-2 py-0.5 eyebrow text-muted-foreground">
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function ZeroAdminConfirmationCallout({
  adminCount,
  zeroAdminConfirmed,
  onZeroAdminConfirmedChange
}: {
  adminCount: number;
  zeroAdminConfirmed?: boolean;
  onZeroAdminConfirmedChange?: (value: boolean) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsTaskSurface");
  if (adminCount !== 0 || !onZeroAdminConfirmedChange) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 sm:p-4">
      <p className="text-sm font-medium text-foreground">{i18n("thisWalletWouldHaveNoOwner")}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {i18n("nobodyCouldChangeItDirectlyOnlyTheRecovery")}
      </p>
      <label className="mt-3 inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(zeroAdminConfirmed)}
          onChange={(event) => onZeroAdminConfirmedChange(event.target.checked)}
        />
        {i18n("iUnderstandAndWantThisWalletToHave")}
      </label>
    </div>
  );
}

export function FocusedTaskSurface({
  title,
  description,
  icon: Icon,
  tasks,
  selectedTask,
  onSelectTask,
  badgeByTask,
  disabledTaskIds,
  disabledReasonByTask,
  issueCount,
  children
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  tasks: GuidedAdminTaskDefinition[];
  selectedTask: UserWorkspaceTask | null;
  onSelectTask: (task: UserWorkspaceTask) => void;
  badgeByTask?: Partial<Record<UserWorkspaceTask, string>>;
  disabledTaskIds?: UserWorkspaceTask[];
  disabledReasonByTask?: Partial<Record<UserWorkspaceTask, string>>;
  issueCount?: number;
  children: ReactNode;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsTaskSurface");
  const activeTask = tasks.find((task) => task.id === selectedTask) ?? tasks[0]!;
  const ActiveIcon = activeTask.icon;
  const descriptionIsLong = description.length > LONG_DESCRIPTION_LIMIT;

  return (
    <div className="space-y-4">
      <div className="user-surface user-section-panel rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
        <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border/70 bg-background/60 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {title}
                  {descriptionIsLong ? (
                    <InfoHint label={i18n("moreAboutTitle", { title: title })} contentClassName="max-w-sm">
                      {description}
                    </InfoHint>
                  ) : null}
                </p>
                {!descriptionIsLong ? (
                  <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                ) : null}
              </div>
            </div>
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-2">
            <Badge variant="secondary" className="inline-flex items-center gap-1.5">
              <ActiveIcon className="h-3.5 w-3.5" />
              {activeTask.label}
            </Badge>
            {typeof issueCount === "number" ? (
              <Badge variant={issueCount > 0 ? "warning" : "outline"} className="whitespace-nowrap">
                {issueCount > 0 ? formatCountLabel(issueCount, "issue") : i18n("noIssues")}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="mt-4">
          <GuidedAdminTaskTabs
            tasks={tasks}
            selectedTask={selectedTask}
            onSelect={onSelectTask}
            badgeByTask={badgeByTask}
            disabledTaskIds={disabledTaskIds}
            disabledReasonByTask={disabledReasonByTask}
          />
        </div>
      </div>
      <div className="user-panel-swap space-y-4">{children}</div>
    </div>
  );
}

