"use client";

import { useId } from "react";

import { StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";
import { GuidedDateTimeField } from "./guided-fields";
import { FocusedTaskSurface, TaskEmptyState, ZeroAdminConfirmationCallout } from "./task-surface";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FieldErrors, type UserWorkspaceTask } from "@/components/user/flow-types";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/guided-admin-catalog";
import { countFieldErrorMessages, formatCountLabel, removeAt, replaceAt } from "@/components/user/workspace/helpers";
import { personLabel } from "@/lib/contracts/person-label";
import { type StateFormState, type UserFormState, type UserPreset, applyUserPreset, countAdminUsersInStateForm, createDefaultUserFormState, nextGeneratedId } from "@/lib/contracts/state-form";
import { KeyRound, Plus, ShieldUser, UserCog, UsersRound } from "lucide-react";

/**
 * The approval power the contract will actually count. `multisig_threshold_is_met`
 * (`smart-contract/lib/state/configuration.ak:278-284`) adds a person's
 * `multi_sig_power` only when it is `Some` AND above zero, so "Some" with a blank or
 * zero box is worth exactly as much as "None": nothing.
 */
function countedApprovalPower(user: UserFormState): number {
  if (user.multiSigPowerMode !== "some") {
    return 0;
  }
  const parsed = Number.parseInt(user.multiSigPower, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function AdminSignerUserEditor({
  user,
  onChange,
  onRemove
}: {
  user: UserFormState;
  onChange: (value: UserFormState) => void;
  onRemove: () => void;
}) {
  // `useId` rather than a row index: this editor and the spender one below render the
  // same field names, and two lists both starting at 0 would emit duplicate ids.
  const uid = useId();
  const isCustomPreset = user.preset === "custom";
  const approvalPower = countedApprovalPower(user);

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{personLabel("Person", user)}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={user.isAdmin ? "secondary" : "outline"}>
              {user.isAdmin ? "Owner" : "Spender"}
            </Badge>
            {/* This said "Signer power", which named the stored field instead of the
                effect, and read the same whether the box below held 5 or nothing at
                all. It now shows the number the contract will count. */}
            <Badge variant={approvalPower > 0 ? "secondary" : "outline"}>
              {approvalPower > 0 ? `Approval power ${approvalPower}` : "No approval power"}
            </Badge>
            <Badge variant="outline">
              {formatCountLabel(user.wallets.length, "linked wallet")}
            </Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-preset`}>Role</Label>
          <Select
            id={`${uid}-preset`}
            value={user.preset}
            onChange={(event) => onChange(applyUserPreset(user, event.target.value as UserPreset))}
          >
            <option value="admin">Owner</option>
            <option value="limited-withdrawal">Spender with a daily limit</option>
            <option value="custom">Custom</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            An owner can change every wallet setting and spend without a limit. A spender
            can only spend what you allow them each day.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-cosign-rule`}>Counts toward approvals</Label>
          <Select
            id={`${uid}-cosign-rule`}
            value={user.multiSigPowerMode}
            onChange={(event) =>
              onChange({
                ...user,
                multiSigPowerMode: event.target.value as "none" | "some"
              })
            }
          >
            <option value="none">No</option>
            <option value="some">Yes</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-cosign-weight`}>Approval power</Label>
          <Input
            id={`${uid}-cosign-weight`}
            value={user.multiSigPower}
            onChange={(event) => onChange({ ...user, multiSigPower: event.target.value })}
            disabled={user.multiSigPowerMode === "none"}
            placeholder="0"
          />
          {/* The box was greyed out with nothing to say why, and when it was live it
              gave no clue what the number meant or what counted as enough. */}
          <p className="text-xs text-muted-foreground">
            {user.multiSigPowerMode === "none"
              ? "Set Counts toward approvals to Yes to give this person approval power."
              : "Added up with everyone else who approves. Zero counts for nothing."}
          </p>
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
            Owner
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
            {/*
             * This read "Can renew proof of live". The typo is why the banned term
             * `proof of life` never tripped `copy-terms.test.ts`, and neither spelling
             * tells the reader what the right is. The wallet already calls this the
             * wake-up timer, and the action that pushes it out is a check-in
             * (`guided-action-adapters.ts:159-163`). An owner always holds this right
             * (`lib/contracts/state-form.ts:276`), which is why the box locks on.
             */}
            Can check in to refresh the wake-up timer
            {user.isAdmin ? (
              <span className="text-xs text-muted-foreground">(every owner can)</span>
            ) : null}
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
  const uid = useId();
  const isAdminPreset = user.preset === "admin";

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          {/* This row used to be headed "Spender", including for an owner, who is the
              one person here that no daily limit applies to. The tab lists everybody,
              so the heading names nobody's role. */}
          <p className="font-medium text-foreground">{personLabel("Person", user)}</p>
          <div className="flex flex-wrap gap-2">
            {/* "Admin preset" and "User preset" named the stored value. What the reader
                needs from this row is whether the limits below apply, and for an owner
                they do not: an owner signs on the Admin path
                (`smart-contract/lib/state/authorization.ak:127`), which never reads
                `per_day_allowance`. */}
            <Badge variant={isAdminPreset ? "warning" : "secondary"}>
              {isAdminPreset ? "Owner: no daily limit" : "Spender"}
            </Badge>
            <Badge variant="outline">
              {formatCountLabel(user.wallets.length, "linked wallet")}
            </Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-preset`}>Role</Label>
          <Select
            id={`${uid}-preset`}
            value={user.preset}
            onChange={(event) => onChange(applyUserPreset(user, event.target.value as UserPreset))}
          >
            <option value="limited-withdrawal">Spender with a daily limit</option>
            <option value="custom">Custom</option>
            <option value="admin">Owner</option>
          </Select>
        </div>
        {/* Hidden for an owner along with the two limit editors below. A reset time for
            a limit that does not exist is a control about nothing. */}
        <div className={isAdminPreset ? "hidden" : "space-y-1"}>
          {/* "Next allowance reset" read as a scheduled event. Nothing runs at this
              time: `remaining_allowance_available_for_use`
              (`smart-contract/lib/state/allowance.ak:190-199`) hands back the full
              daily limit on the first payment made at or after it, and
              `next_allowance_reset_after_use` (`:222-233`) then pushes it to at least
              a day past that payment. */}
          <GuidedDateTimeField
            idPrefix={`spending-user-${index}-next-allowance-reset`}
            label="Limit resets after"
            value={user.nextAllowanceReset}
            onChange={(nextAllowanceReset) => onChange({ ...user, nextAllowanceReset })}
            helper="The first payment made after this time gets the full daily limit again, and sets this time at least a day later."
          />
        </div>
      </div>
      {isAdminPreset ? (
        // The two allowance editors used to vanish here with nothing said. A reader who
        // had just typed a limit and then chose Owner saw their work disappear.
        <p className="text-xs text-muted-foreground">
          An owner spends without a daily limit, so there is none to set. Choose
          another role to give this person one.
        </p>
      ) : (
        <>
          <StateAssetAmountListEditor
            label="Daily limit"
            helper="How much this person can spend each day."
            value={user.perDayAllowance}
            onChange={(perDayAllowance) => onChange({ ...user, perDayAllowance })}
          />
          <StateAssetAmountListEditor
            label="Left to spend"
            helper="What is left of the daily limit right now. It goes back to the full limit on the first payment made after the reset time above."
            value={user.remainingAllowance}
            onChange={(remainingAllowance) => onChange({ ...user, remainingAllowance })}
          />
        </>
      )}
    </div>
  );
}

function WalletAssignmentUserEditor({
  user,
  onChange,
  onRemove
}: {
  user: UserFormState;
  onChange: (value: UserFormState) => void;
  onRemove: () => void;
}) {
  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{personLabel("Person", user)}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={user.isAdmin ? "secondary" : "outline"}>
              {user.isAdmin ? "Owner" : "Spender"}
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
      description="Owners, spenders, and the wallets linked to them."
      icon={UsersRound}
      tasks={tasks}
      selectedTask={selectedTask}
      onSelectTask={onSelectTask}
      badgeByTask={{
        "people-admins-signers": formatCountLabel(adminCount, "owner"),
        "people-spending-users": formatCountLabel(
          Math.max(value.users.length - adminCount, 0),
          "spender"
        ),
        "people-wallet-assignments": `${walletAssignedCount}/${value.users.length} linked`
      }}
      issueCount={issueCount}
    >
      <ZeroAdminConfirmationCallout
        adminCount={adminCount}
        zeroAdminConfirmed={zeroAdminConfirmed}
        onZeroAdminConfirmedChange={onZeroAdminConfirmedChange}
      />
      {selectedTask === "people-admins-signers" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* This said "Edit owner access only." while the list below it holds every
                person in the wallet, spenders included. The list is right: you make
                someone an owner from here, so everyone has to be reachable. The
                sentence was the part that was wrong. */}
            <p className="text-sm text-muted-foreground">
              Everyone in this wallet. Change anyone here to an owner, or take the role
              away.
            </p>
            <Button type="button" variant="secondary" onClick={addAdminUser}>
              <Plus className="h-4 w-4" />
              Add owner
            </Button>
          </div>
          {value.users.length === 0 ? (
            <TaskEmptyState
              icon={ShieldUser}
              title="Nobody can change this wallet"
              description="Add the first owner. An owner can change every wallet setting."
              actionLabel="Add owner"
              onAction={addAdminUser}
            />
          ) : (
            value.users.map((user, index) => (
              <AdminSignerUserEditor
                key={`admin-signer-${index}-${user.id}`}
                user={user}
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
            {/* Same fault the owners tab had: "Edit spenders only." sat above a list of
                every person in the wallet. You set a daily limit from here, so everyone
                has to be reachable. */}
            <p className="text-sm text-muted-foreground">
              Everyone in this wallet, and what each one may spend each day.
            </p>
            <Button type="button" variant="secondary" onClick={addSpendingUser}>
              <Plus className="h-4 w-4" />
              Add spender
            </Button>
          </div>
          {value.users.length === 0 ? (
            <TaskEmptyState
              icon={UserCog}
              title="Nobody can spend from this wallet yet"
              description="Add a spender, then set how much they may spend each day."
              actionLabel="Add spender"
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
              Edit linked wallets only.
            </p>
            <Button type="button" variant="secondary" onClick={addSpendingUser}>
              <Plus className="h-4 w-4" />
              Add person
            </Button>
          </div>
          {value.users.length === 0 ? (
            <TaskEmptyState
              icon={KeyRound}
              title="No wallet assignments yet"
              description="Add a person, then link wallets."
              actionLabel="Add person"
              onAction={addSpendingUser}
            />
          ) : (
            value.users.map((user, index) => (
              <WalletAssignmentUserEditor
                key={`wallet-assignment-${index}-${user.id}`}
                user={user}
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
