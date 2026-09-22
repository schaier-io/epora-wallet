"use client";
import { useTranslations } from "next-intl";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type UserWorkspaceTask } from "@/components/user/flow-types";
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
  return (
    <div className="user-surface rounded-lg border border-dashed border-border/60 bg-background/30 p-3 sm:p-4 text-center">
      {/* Block-level, not inline-flex: two inline boxes flowed onto one text line
          beside the title (no gap, baseline-aligned) whenever the title was short. */}
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-border/70 bg-background/60 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {/* Shown at any length. Over 78 characters this went into an ⓘ popover and was
          never rendered visibly, so the recovery-contacts empty state, whose only job is
          to explain recovery contacts to a reader who has none, showed nothing at all.
          `PopupDialog` dropped the same mechanism for the same reason. */}
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
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
            // Which chip is the open one was said in colour alone. Every chip already names
            // itself, so the row did not read as identical buttons, but none of them was
            // marked as the current one, so the only way to learn which task was open was to
            // read the panel underneath and infer it. `aria-current` is what the sidebar, the
            // guided action cards and the proposal list already use for the same question.
            aria-current={isActive ? "true" : undefined}
            // Every chip carries its full `label`. The chip itself shows `shortLabel` and
            // truncates it, and the header badge that used to print the open task's full
            // label is gone, so without this a sighted pointer user has no way to read a
            // long task name: `aria-label` reaches a screen reader only. The tooltip was
            // once dropped because it landed on the badge below and clipped its
            // descenders, which is a cost worth paying for the only visible copy of the
            // name. A disabled chip appends the reason it is off.
            title={disabledReason ? i18n("value1Disabledreason", { value1: task.label, disabledReason: disabledReason }) : task.label}
            className={cn(
              "user-surface user-task-chip inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border px-3 py-2 text-left text-sm transition-[background-color,border-color,color,box-shadow,transform]",
              isActive
                ? // The halo is the one difference here that is a shape rather than a hue,
                  // and at 1px against an 18% mix it was not visible enough to be read as
                  // one. Doubling it and lifting the mix costs no layout: a box-shadow is
                  // painted outside the box.
                  "border-primary/45 bg-primary/12 text-foreground shadow-[0_0_0_2px_color-mix(in_oklch,var(--primary)_45%,transparent)]"
                : "border-border/70 bg-background/40 text-muted-foreground hover:border-primary/30 hover:text-foreground",
              isDisabled && "cursor-not-allowed opacity-45"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {/* Weight, which is not a colour value at all. The palette is chroma 0 through
                (`--primary` is `oklch(0.922 0 0)` in the only theme this app ships), so the
                open chip and a closed one were separated by lightness and nothing else. */}
            <span className={cn("min-w-0 truncate", isActive ? "font-semibold" : "font-medium")}>
              {task.shortLabel}
            </span>
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

/**
 * The tab strip for a group of related tasks, plus the group's issue count.
 *
 * No heading row. It used to carry an icon, the group's title and its description
 * ("Wallet settings" / "Edit recovery contacts, proof of life, and approvals."), which the
 * action card directly above prints in its own words ("Update wallet settings" / "Saves
 * changes to people, recovery contacts, approvals, or the proof of life."), and a badge
 * naming the selected task, which is the highlighted tab a few pixels below it.
 */
export function FocusedTaskSurface({
  tasks,
  selectedTask,
  onSelectTask,
  badgeByTask,
  disabledTaskIds,
  disabledReasonByTask,
  issueCount,
  children
}: {
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

  return (
    <div className="space-y-4">
      <div className="user-surface user-section-panel rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
        {typeof issueCount === "number" ? (
          <div className="mb-3 flex justify-end">
            <Badge variant={issueCount > 0 ? "warning" : "outline"} className="whitespace-nowrap">
              {issueCount > 0 ? formatCountLabel(issueCount, "issue") : i18n("noIssues")}
            </Badge>
          </div>
        ) : null}
        <div>
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

