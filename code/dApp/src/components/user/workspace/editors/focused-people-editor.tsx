"use client";
import { useTranslations } from "next-intl";


import { StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";
import { GuidedDateTimeField } from "./guided-fields";
import { FocusedTaskSurface, TaskEmptyState, ZeroAdminConfirmationCallout } from "./task-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FieldErrors, type UserWorkspaceTask } from "@/components/user/flow-types";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/constants";
import { countFieldErrorMessages, removeAt, replaceAt } from "@/components/user/workspace/helpers";
import { type StateFormState, type UserFormState, type UserPreset, applyUserPreset, countAdminUsersInStateForm, createDefaultUserFormState, nextGeneratedId } from "@/lib/contracts/state-form";
import { KeyRound, Plus, ShieldUser, UserCog, UsersRound } from "lucide-react";

function AdminSignerUserEditor({
  user,
  index,
  onChange,
  onRemove
}: {
  user: UserFormState;
  index: number;
  onChange: (value: UserFormState) => void;
  onRemove: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
  const countI18n = useTranslations("Counts");
  const isCustomPreset = user.preset === "custom";

  return (
    <div className="user-surface user-list-item space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{i18n("person")} {index + 1}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={user.isAdmin ? "secondary" : "outline"}>
              {user.isAdmin ? i18n("owner") : i18n("notAnOwner")}
            </Badge>
            <Badge variant={user.multiSigPowerMode === "some" ? "secondary" : "outline"}>
              {user.multiSigPowerMode === "some" ? i18n("approvalWeightSet") : i18n("notAnApprover")}
            </Badge>
            <Badge variant="outline">{countI18n("signerKey", { count: user.wallets.length })}</Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("remove")}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5">
          <Label>{i18n("role")}</Label>
          <select
            value={user.preset}
            onChange={(event) => onChange(applyUserPreset(user, event.target.value as UserPreset))}
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="admin">{i18n("owner")}</option>
            <option value="limited-withdrawal">{i18n("spender")}</option>
            <option value="custom">{i18n("custom")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>{i18n("approvalRole")}</Label>
          <select
            value={user.multiSigPowerMode}
            onChange={(event) =>
              onChange({
                ...user,
                multiSigPowerMode: event.target.value as "none" | "some"
              })
            }
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="none">{i18n("notAnApprover")}</option>
            <option value="some">{i18n("setAWeight")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>{i18n("approvalWeight")}</Label>
          <Input
            value={user.multiSigPower}
            onChange={(event) => onChange({ ...user, multiSigPower: event.target.value })}
            disabled={user.multiSigPowerMode === "none"}
            placeholder="0"
          />
        </div>
      </div>
      {isCustomPreset ? (
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={user.isAdmin}
              onChange={(event) =>
                onChange({
                  ...user,
                  isAdmin: event.target.checked,
                  canRenewProofOfLife: event.target.checked ? true : user.canRenewProofOfLife
                })
              }
            />
            {i18n("ownerAccess")}
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={user.canRenewProofOfLife}
              onChange={(event) =>
                onChange({ ...user, canRenewProofOfLife: event.target.checked })
              }
              disabled={user.isAdmin}
            />
            {i18n("canRefreshTheWakeUpTimer")}
          </label>
        </div>
      ) : null}
    </div>
  );
}

function SpendingUserEditor({
  user,
  index,
  onChange,
  onRemove
}: {
  user: UserFormState;
  index: number;
  onChange: (value: UserFormState) => void;
  onRemove: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
  const countI18n = useTranslations("Counts");
  const isAdminPreset = user.preset === "admin";

  return (
    <div className="user-surface user-list-item space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{i18n("person")} {index + 1}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={isAdminPreset ? "warning" : "secondary"}>
              {isAdminPreset ? i18n("owner") : i18n("spender")}
            </Badge>
            <Badge variant="outline">{countI18n("signerKey", { count: user.wallets.length })}</Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("remove")}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{i18n("role")}</Label>
          <select
            value={user.preset}
            onChange={(event) => onChange(applyUserPreset(user, event.target.value as UserPreset))}
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="limited-withdrawal">{i18n("spender")}</option>
            <option value="custom">{i18n("custom")}</option>
            <option value="admin">{i18n("owner")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <GuidedDateTimeField
            idPrefix={`spending-user-${index}-next-allowance-reset`}
            label={i18n("nextAllowanceReset")}
            value={user.nextAllowanceReset}
            onChange={(nextAllowanceReset) => onChange({ ...user, nextAllowanceReset })}
            helper={i18n("chooseTheNextLocalDateAndTimeWhen")}
          />
        </div>
      </div>
      {!isAdminPreset ? (
        <>
          <StateAssetAmountListEditor
            label={i18n("dailyLimit")}
            helper={i18n("setHowMuchThisSpenderCanSendPer")}
            value={user.perDayAllowance}
            onChange={(perDayAllowance) => onChange({ ...user, perDayAllowance })}
          />
          <StateAssetAmountListEditor
            label={i18n("remainingAllowance")}
            helper={i18n("tracksTheRemainingAllowanceForTheCurrentPeriod")}
            value={user.remainingAllowance}
            onChange={(remainingAllowance) => onChange({ ...user, remainingAllowance })}
          />
        </>
      ) : null}
    </div>
  );
}

function WalletAssignmentUserEditor({
  user,
  index,
  onChange,
  onRemove
}: {
  user: UserFormState;
  index: number;
  onChange: (value: UserFormState) => void;
  onRemove: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
  const countI18n = useTranslations("Counts");
  return (
    <div className="user-surface user-list-item space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{i18n("person")} {index + 1}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={user.isAdmin ? "secondary" : "outline"}>
              {user.isAdmin ? i18n("owner") : i18n("notAnOwner")}
            </Badge>
            <Badge variant="outline">{countI18n("signerKey", { count: user.wallets.length })}</Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("remove")}
        </Button>
      </div>
      <WalletHashesEditor
        label={i18n("signerKeys")}
        helper={i18n("addEachSignerKeyHashLinkedToThis")}
        value={user.wallets}
        onChange={(wallets) => onChange({ ...user, wallets })}
      />
    </div>
  );
}

export function FocusedPeopleEditor({
  value,
  onChange,
  selectedTask,
  onSelectTask,
  fieldErrors,
  zeroAdminConfirmed,
  onZeroAdminConfirmedChange
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
  selectedTask: UserWorkspaceTask | null;
  onSelectTask: (task: UserWorkspaceTask) => void;
  fieldErrors: FieldErrors;
  zeroAdminConfirmed?: boolean;
  onZeroAdminConfirmedChange?: (value: boolean) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
  const countI18n = useTranslations("Counts");
  const tasks = GUIDED_ADMIN_TASKS.filter((task) => task.group === "manage-people");
  const adminCount = countAdminUsersInStateForm(value);
  const walletAssignedCount = value.users.filter((user) => user.wallets.length > 0).length;
  const issueCount = countFieldErrorMessages(fieldErrors);

  const addAdminUser = () =>
    onChange({
      ...value,
      users: [
        ...value.users,
        applyUserPreset(createDefaultUserFormState(nextGeneratedId(value.users)), "admin")
      ]
    });
  const addSpendingUser = () =>
    onChange({
      ...value,
      users: [
        ...value.users,
        applyUserPreset(
          createDefaultUserFormState(nextGeneratedId(value.users)),
          "limited-withdrawal"
        )
      ]
    });

  return (
    <FocusedTaskSurface
      title={i18n("people")}
      description={i18n("editOwnersSpendersAndTheSignerKeysLinked")}
      icon={UsersRound}
      tasks={tasks}
      selectedTask={selectedTask}
      onSelectTask={onSelectTask}
      badgeByTask={{
        "people-admins-signers": countI18n("owner", { count: adminCount }),
        "people-spending-users": countI18n("spender", {
          count: Math.max(value.users.length - adminCount, 0)
        }),
        "people-wallet-assignments": i18n("value1OfValue2Linked", {
          linked: walletAssignedCount,
          total: value.users.length
        })
      }}
      issueCount={issueCount}
      stats={
        <>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{i18n("owners")}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{adminCount}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{i18n("people")}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{value.users.length}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{i18n("signerKeys")}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{walletAssignedCount}</p>
          </div>
        </>
      }
    >
      <ZeroAdminConfirmationCallout
        adminCount={adminCount}
        zeroAdminConfirmed={zeroAdminConfirmed}
        onZeroAdminConfirmedChange={onZeroAdminConfirmedChange}
      />
      {selectedTask === "people-admins-signers" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {i18n("reviewEachPersonSRoleAndApprovalWeight")}
            </p>
            <Button type="button" variant="secondary" onClick={addAdminUser}>
              <Plus className="h-4 w-4" />
              {i18n("addOwner")}
            </Button>
          </div>
          {value.users.length === 0 ? (
            <TaskEmptyState
              icon={ShieldUser}
              title={i18n("noPeopleYet")}
              description={i18n("addTheFirstPersonWhoCanManageThis")}
              actionLabel={i18n("addOwner")}
              onAction={addAdminUser}
            />
          ) : (
            value.users.map((user, index) => (
              <AdminSignerUserEditor
                key={`admin-signer-${index}-${user.id}`}
                user={user}
                index={index}
                onChange={(nextUser) =>
                  onChange({
                    ...value,
                    users: replaceAt(value.users, index, nextUser)
                  })
                }
                onRemove={() =>
                  onChange({
                    ...value,
                    users: removeAt(value.users, index)
                  })
                }
              />
            ))
          )}
        </>
      ) : null}
      {selectedTask === "people-spending-users" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {i18n("reviewEachPersonSRoleAndDailySpending")}
            </p>
            <Button type="button" variant="secondary" onClick={addSpendingUser}>
              <Plus className="h-4 w-4" />
              {i18n("addSpender")}
            </Button>
          </div>
          {value.users.length === 0 ? (
            <TaskEmptyState
              icon={UserCog}
              title={i18n("noSpendersYet")}
              description={i18n("addSomeoneWhoCanSpendWithinADaily")}
              actionLabel={i18n("addSpender")}
              onAction={addSpendingUser}
            />
          ) : (
            value.users.map((user, index) => (
              <SpendingUserEditor
                key={`spending-user-${index}-${user.id}`}
                user={user}
                index={index}
                onChange={(nextUser) =>
                  onChange({
                    ...value,
                    users: replaceAt(value.users, index, nextUser)
                  })
                }
                onRemove={() =>
                  onChange({
                    ...value,
                    users: removeAt(value.users, index)
                  })
                }
              />
            ))
          )}
        </>
      ) : null}
      {selectedTask === "people-wallet-assignments" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {i18n("editTheSignerKeysLinkedToEachPerson")}
            </p>
            <Button type="button" variant="secondary" onClick={addSpendingUser}>
              <Plus className="h-4 w-4" />
              {i18n("addPerson")}
            </Button>
          </div>
          {value.users.length === 0 ? (
            <TaskEmptyState
              icon={KeyRound}
              title={i18n("noSignerKeysYet")}
              description={i18n("addAPersonThenLinkOneOrMore")}
              actionLabel={i18n("addPerson")}
              onAction={addSpendingUser}
            />
          ) : (
            value.users.map((user, index) => (
              <WalletAssignmentUserEditor
                key={`wallet-assignment-${index}-${user.id}`}
                user={user}
                index={index}
                onChange={(nextUser) =>
                  onChange({
                    ...value,
                    users: replaceAt(value.users, index, nextUser)
                  })
                }
                onRemove={() =>
                  onChange({
                    ...value,
                    users: removeAt(value.users, index)
                  })
                }
              />
            ))
          )}
        </>
      ) : null}
    </FocusedTaskSurface>
  );
}
