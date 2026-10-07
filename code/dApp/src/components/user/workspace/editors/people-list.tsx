"use client";
import { useTranslations } from "next-intl";
import { Plus, ShieldUser } from "lucide-react";

import { PersonRow } from "./person-row";
import { TaskEmptyState } from "./task-surface";
import { Button } from "@/components/ui/button";
import { withUserAdded } from "@/components/user/workspace/helpers/form-state";
import { groupPeople } from "@/components/user/workspace/helpers/people-model";
import { type StateFormState } from "@/lib/contracts/state-form";
import { MAX_ACCESS_RECORDS, MAX_USERS } from "@/lib/contracts/state-validation";

/**
 * Everyone in the wallet, once each: owners, co-signers, spenders and recovery
 * contacts in one list. One row is open at a time, so the page stays one screen of
 * names until somebody is being edited.
 */
export function PeopleList({
  value,
  onChange,
  openKey,
  onOpenKeyChange
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
  openKey: string | null;
  onOpenKeyChange: (key: string | null) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
  const people = groupPeople(value);
  const atCap =
    value.users.length >= MAX_USERS ||
    value.users.length + value.beneficiaries.length >= MAX_ACCESS_RECORDS;
  const addPerson = () => {
    if (atCap) return;
    const next = withUserAdded(value, "limited-withdrawal");
    onOpenKeyChange(`user-${next.users[next.users.length - 1].id}`);
    onChange(next);
  };

  return (
    <section aria-labelledby="people-list-heading" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h3 id="people-list-heading" className="eyebrow text-muted-foreground">
          {i18n("people")}
        </h3>
        {people.length > 0 ? (
          <Button type="button" variant="secondary" size="sm" onClick={addPerson} disabled={atCap}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {i18n("addPerson")}
          </Button>
        ) : null}
      </div>
      {atCap ? (
        <p className="px-1 text-xs text-muted-foreground">
          {value.users.length < MAX_USERS
            ? i18n("thisWalletAlreadyHoldsMaxAccessRecords", { max: MAX_ACCESS_RECORDS })
            : i18n("thisWalletAlreadyHoldsMaxPeople", { max: MAX_USERS })}
        </p>
      ) : null}
      {people.length === 0 ? (
        <TaskEmptyState
          icon={ShieldUser}
          title={i18n("nobodyIsInThisWalletYet")}
          description={i18n("addTheFirstPersonThenGiveThem")}
          actionLabel={atCap ? undefined : i18n("addPerson")}
          onAction={atCap ? undefined : addPerson}
        />
      ) : (
        <ul className="user-surface rounded-lg border border-border/60 bg-background/40">
          {people.map((person) => (
            <PersonRow
              key={person.key}
              value={value}
              person={person}
              open={openKey === person.key}
              onOpenChange={onOpenKeyChange}
              onChange={onChange}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
