"use client";

import { StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";
import { GuidedDateTimeField } from "./guided-fields";
import { FocusedTaskSurface, TaskEmptyState, ZeroAdminConfirmationCallout } from "./task-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FieldErrors, type UserWorkspaceTask } from "@/components/user/flow-types";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/constants";
import { countFieldErrorMessages, formatCountLabel } from "@/components/user/workspace/helpers";
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
  const isCustomPreset = user.preset === "custom";

  return (
    <div className="user-surface user-list-item space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">User {index + 1}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={user.isAdmin ? "secondary" : "outline"}>
              {user.isAdmin ? "Admin" : "Non-admin"}
            </Badge>
            <Badge variant={user.multiSigPowerMode === "some" ? "secondary" : "outline"}>
              {user.multiSigPowerMode === "some" ? "Signer power" : "No signer power"}
            </Badge>
            <Badge variant="outline">{formatCountLabel(user.wallets.length, "wallet key")}</Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5">
          <Label>User Preset</Label>
          <select
            value={user.preset}
            onChange={(event) => onChange(applyUserPreset(user, event.target.value as UserPreset))}
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="admin">Admin</option>
            <option value="limited-withdrawal">Daily limit spender</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Co-sign rule</Label>
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
            <option value="none">None</option>
            <option value="some">Some</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Co-sign weight</Label>
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
            Admin access
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
            Can renew proof of live
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
  const isAdminPreset = user.preset === "admin";

  return (
    <div className="user-surface user-list-item space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">Spending user {index + 1}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={isAdminPreset ? "warning" : "secondary"}>
              {isAdminPreset ? "Admin preset" : "User preset"}
            </Badge>
            <Badge variant="outline">{formatCountLabel(user.wallets.length, "wallet key")}</Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>User Preset</Label>
          <select
            value={user.preset}
            onChange={(event) => onChange(applyUserPreset(user, event.target.value as UserPreset))}
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="limited-withdrawal">Daily limit spender</option>
            <option value="custom">Custom</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <GuidedDateTimeField
            idPrefix={`spending-user-${index}-next-allowance-reset`}
            label="Next allowance reset"
            value={user.nextAllowanceReset}
            onChange={(nextAllowanceReset) => onChange({ ...user, nextAllowanceReset })}
            helper="Choose the next local date and time when this allowance resets."
          />
        </div>
      </div>
      {!isAdminPreset ? (
        <>
          <StateAssetAmountListEditor
            label="Daily limit"
            helper="Configure the asset-based daily withdrawal allowance."
            value={user.perDayAllowance}
            onChange={(perDayAllowance) => onChange({ ...user, perDayAllowance })}
          />
          <StateAssetAmountListEditor
            label="Remaining Allowance"
            helper="Tracks the remaining allowance for the current period."
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
  return (
    <div className="user-surface user-list-item space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">Wallet assignment {index + 1}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={user.isAdmin ? "secondary" : "outline"}>
              {user.isAdmin ? "Admin" : "User"}
            </Badge>
            <Badge variant="outline">{formatCountLabel(user.wallets.length, "wallet key")}</Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
      <WalletHashesEditor
        label="User Wallets"
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
      title="People"
      description="Edit access, users, and wallet links."
      icon={UsersRound}
      tasks={tasks}
      selectedTask={selectedTask}
      onSelectTask={onSelectTask}
      badgeByTask={{
        "people-admins-signers": formatCountLabel(adminCount, "admin"),
        "people-spending-users": formatCountLabel(
          Math.max(value.users.length - adminCount, 0),
          "user"
        ),
        "people-wallet-assignments": `${walletAssignedCount}/${value.users.length} linked`
      }}
      issueCount={issueCount}
      stats={
        <>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Admins</p>
            <p className="mt-1 text-sm font-medium text-foreground">{adminCount}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Users</p>
            <p className="mt-1 text-sm font-medium text-foreground">{value.users.length}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Wallet links</p>
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
              Edit admin access only.
            </p>
            <Button type="button" variant="secondary" onClick={addAdminUser}>
              <Plus className="h-4 w-4" />
              Add Admin
            </Button>
          </div>
          {value.users.length === 0 ? (
            <TaskEmptyState
              icon={ShieldUser}
              title="No people yet"
              description="Add your first admin."
              actionLabel="Add Admin"
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
                    users: value.users.map((entry, entryIndex) =>
                      entryIndex === index ? nextUser : entry
                    )
                  })
                }
                onRemove={() =>
                  onChange({
                    ...value,
                    users: value.users.filter((_, entryIndex) => entryIndex !== index)
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
              Edit allowance users only.
            </p>
            <Button type="button" variant="secondary" onClick={addSpendingUser}>
              <Plus className="h-4 w-4" />
              Add Spending User
            </Button>
          </div>
          {value.users.length === 0 ? (
            <TaskEmptyState
              icon={UserCog}
              title="No spending users yet"
              description="Add a spending user."
              actionLabel="Add Spending User"
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
                    users: value.users.map((entry, entryIndex) =>
                      entryIndex === index ? nextUser : entry
                    )
                  })
                }
                onRemove={() =>
                  onChange({
                    ...value,
                    users: value.users.filter((_, entryIndex) => entryIndex !== index)
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
              Edit linked wallets only.
            </p>
            <Button type="button" variant="secondary" onClick={addSpendingUser}>
              <Plus className="h-4 w-4" />
              Add Person
            </Button>
          </div>
          {value.users.length === 0 ? (
            <TaskEmptyState
              icon={KeyRound}
              title="No wallet assignments yet"
              description="Add a person, then link wallets."
              actionLabel="Add Person"
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
                    users: value.users.map((entry, entryIndex) =>
                      entryIndex === index ? nextUser : entry
                    )
                  })
                }
                onRemove={() =>
                  onChange({
                    ...value,
                    users: value.users.filter((_, entryIndex) => entryIndex !== index)
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
