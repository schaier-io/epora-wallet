"use client";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { settingsValidationTask } from "../helpers/settings-validation-task";
import { PeopleList } from "./people-list";
import { ZeroAdminConfirmationCallout } from "./task-surface";
import { WalletNameEditor } from "./wallet-settings-editors";
import { WalletRulesCard, type WalletRule } from "./wallet-rules-card";
import { Button } from "@/components/ui/button";
import { type FieldErrors, type UserWorkspaceTask } from "@/components/user/flow-types";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/guided-admin-catalog";
import { type StateFormState, countAdminUsersInStateForm } from "@/lib/contracts/state-form";

/** The rule a sidebar entry or an issue jump opens. The other tasks open none. */
function ruleForTask(task: UserWorkspaceTask | null): WalletRule | null {
  if (task === "settings-multisig-threshold") return "co-signers";
  if (task === "settings-proof-of-life") return "proof-of-life";
  return null;
}

/**
 * Wallet settings on one page: the name, the two wallet-wide rules, and everyone in
 * the wallet. The sidebar entries still exist; each one opens its part of this page
 * instead of a tab, so a change in one part is never out of sight of the others.
 */
export function FocusedWalletSettingsEditor({
  value,
  onChange,
  selectedTask,
  onSelectTask,
  fieldErrors,
  walletNameEditable = true,
  zeroAdminConfirmed,
  onZeroAdminConfirmedChange,
  thresholdConfirmed,
  onThresholdConfirmedChange
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
  selectedTask: UserWorkspaceTask | null;
  onSelectTask: (task: UserWorkspaceTask) => void;
  fieldErrors: FieldErrors;
  walletNameEditable?: boolean;
  zeroAdminConfirmed?: boolean;
  onZeroAdminConfirmedChange?: (value: boolean) => void;
  thresholdConfirmed?: boolean;
  onThresholdConfirmedChange?: (value: boolean) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedWalletSettingsEditor");
  const tasks = GUIDED_ADMIN_TASKS.filter((task) => task.group === "wallet-settings");
  const root = useRef<HTMLDivElement>(null);
  const [openRule, setOpenRule] = useState<WalletRule | null>(() => ruleForTask(selectedTask));
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  // A sidebar click changes the task while this page stays mounted; open its rule then.
  const [shownTask, setShownTask] = useState(selectedTask);
  if (shownTask !== selectedTask) {
    setShownTask(selectedTask);
    const rule = ruleForTask(selectedTask);
    if (rule) setOpenRule(rule);
  }

  const jumpToTask = (task: UserWorkspaceTask) => {
    onSelectTask(task);
    const rule = ruleForTask(task);
    if (rule) setOpenRule(rule);
    requestAnimationFrame(() => {
      // Both rules live in one card, so the recovery timer scrolls to the same place.
      const target = task === "settings-proof-of-life" ? "settings-multisig-threshold" : task;
      const section = root.current?.querySelector<HTMLElement>(`[data-settings-section="${target}"]`);
      section?.scrollIntoView({ block: "start", behavior: "smooth" });
      // Inside the rule that just opened, not on the first trigger of the card: pressing
      // that would close the rule the issue points at. The confirmation checkbox comes
      // first because an unreachable threshold is the one issue it answers.
      const scope = (rule ? section?.querySelector<HTMLElement>('[role="region"][data-state="open"]') : null) ?? section;
      const field = scope?.querySelector<HTMLElement>('[aria-invalid="true"]')
        // Not the proof-of-life switch: one Space press there turns the timer off.
        ?? scope?.querySelector<HTMLElement>('input[type="checkbox"]:not([role="switch"])')
        ?? scope?.querySelector<HTMLElement>(
          'input:not([disabled]):not([role="switch"]), select:not([disabled]), button:not([disabled])'
        )
        // With the timer off the switch is all there is, and turning it on is the fix.
        ?? scope?.querySelector<HTMLElement>('[role="switch"]');
      field?.focus({ preventScroll: true });
    });
  };
  const issues = Object.values(fieldErrors).flat().map((message) => ({ message, task: settingsValidationTask(message) }));

  return (
    <div ref={root} className="space-y-6">
      {issues.length > 0 ? (
        <section className="space-y-2 rounded-md border border-amber-500/40 p-3" aria-label={i18n("draftIssues")}>
          <p className="text-sm font-medium">{i18n("draftIssues")}</p>
          <ul className="space-y-2 text-xs">
            {issues.map((issue, index) => (
              <li key={index}>
                <p>{issue.message}</p>
                {issue.task ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => jumpToTask(issue.task!)}>
                    {i18n("checkTask", { task: tasks.find((task) => task.id === issue.task)!.label })}
                  </Button>
                ) : (
                  <p className="text-muted-foreground">{i18n("globalIssue")}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ZeroAdminConfirmationCallout
        adminCount={countAdminUsersInStateForm(value)}
        zeroAdminConfirmed={zeroAdminConfirmed}
        onZeroAdminConfirmedChange={onZeroAdminConfirmedChange}
      />
      <section data-settings-section="settings-wallet-name" className="scroll-mt-24">
        <WalletNameEditor
          value={value.walletName}
          onChange={(walletName) => onChange({ ...value, walletName })}
          editable={walletNameEditable}
        />
      </section>
      <section data-settings-section="settings-multisig-threshold" className="scroll-mt-24">
        <WalletRulesCard
          value={value}
          onChange={onChange}
          openRule={openRule}
          onOpenRuleChange={setOpenRule}
          thresholdConfirmed={thresholdConfirmed}
          onThresholdConfirmedChange={onThresholdConfirmedChange}
        />
      </section>
      <section data-settings-section="settings-people" className="scroll-mt-24">
        <PeopleList value={value} onChange={onChange} openKey={openPerson} onOpenKeyChange={setOpenPerson} />
      </section>
    </div>
  );
}
