"use client";
import { useTranslations } from "next-intl";

import { TaskEmptyState, ZeroAdminConfirmationCallout } from "./task-surface";
import { PersonPermissionsEditor } from "./person-permissions-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type FieldErrors } from "@/components/user/flow-types";
import {
  countFieldErrorMessages,
  formatCountLabel,
  removeAt,
  replaceAt,
  withMultisigDerivedFromCoSigners,
  withUserAdded
} from "@/components/user/workspace/helpers";
import { countAdminUsersInStateForm, type StateFormState } from "@/lib/contracts/state-form";
import { Plus, ShieldUser, UsersRound } from "lucide-react";

// One roster, not three tabs: the owners/spenders/wallets tabs each rendered the
// same list of every person with a different slice of their permissions editable.
// What a reader actually wants — and what this surface now shows — is every person
// once, with all of their permissions as chips on the card.

export function FocusedPeopleEditor({
  value,
  onChange,
  fieldErrors,
  zeroAdminConfirmed,
  onZeroAdminConfirmedChange
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
  fieldErrors: FieldErrors;
  zeroAdminConfirmed?: boolean;
  onZeroAdminConfirmedChange?: (value: boolean) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
  const adminCount = countAdminUsersInStateForm(value);
  const issueCount = countFieldErrorMessages(fieldErrors);
  // Every chip that grants or revokes a Co-signer passes through here, so the
  // approval rule (the threshold) follows the chips instead of being a switch
  // someone has to remember to flip on a different page.
  const change = (next: StateFormState) =>
    onChange(withMultisigDerivedFromCoSigners(next));
  const addPerson = () => change(withUserAdded(value, "limited-withdrawal"));
  const parsedNeeded = Number.parseInt(value.multiSigThreshold, 10);
  const approvalsNeeded =
    value.multiSigThresholdMode === "some" && Number.isFinite(parsedNeeded) && parsedNeeded > 0
      ? parsedNeeded
      : undefined;

  return (
    <div className="space-y-4">
      <div className="user-surface user-section-panel rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
        <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border/70 bg-background/60 text-primary">
              <UsersRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{i18n("people")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {i18n("ownersSpendersAndTheWalletsLinkedToThem")}
              </p>
            </div>
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-2">
            <Badge variant="secondary">{formatCountLabel(value.users.length, "person")}</Badge>
            {typeof issueCount === "number" ? (
              <Badge variant={issueCount > 0 ? "warning" : "outline"} className="whitespace-nowrap">
                {issueCount > 0 ? formatCountLabel(issueCount, "issue") : i18n("noIssuesLabel")}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <ZeroAdminConfirmationCallout
        adminCount={adminCount}
        zeroAdminConfirmed={zeroAdminConfirmed}
        onZeroAdminConfirmedChange={onZeroAdminConfirmedChange}
      />

      {value.users.length === 0 ? (
        <TaskEmptyState
          icon={ShieldUser}
          title={i18n("nobodyIsInThisWalletYet")}
          description={i18n("addTheFirstPersonThenGiveThem")}
          actionLabel={i18n("addPerson")}
          onAction={addPerson}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {i18n("everyoneInThisWalletAndWhatEachOneCanDo")}
            </p>
            <Button type="button" variant="secondary" onClick={addPerson}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {i18n("addPerson")}
            </Button>
          </div>
          {value.users.map((user, index) => (
            <PersonPermissionsEditor
              key={`person-${index}-${user.id}`}
              user={user}
              approvalsNeeded={approvalsNeeded}
              onChange={(nextUser) =>
                change({
                  ...value,
                  users: replaceAt(value.users, index, nextUser)
                })
              }
              onRemove={() =>
                change({
                  ...value,
                  users: removeAt(value.users, index)
                })
              }
            />
          ))}
        </>
      )}
    </div>
  );
}
