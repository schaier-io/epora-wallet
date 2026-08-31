"use client";
import { useTranslations } from "next-intl";


import { useAtomValue } from "jotai";
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
import {
  approvalPowerForUser,
  countFieldErrorMessages,
  formatCountLabel,
  removeAt,
  replaceAt,
  withApprovalPowerEnabled,
  withUserAdded,
  withUserAdminEnabled
} from "@/components/user/workspace/helpers";
import { personLabel } from "@/lib/contracts/person-label";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import {
  type StateFormState,
  type UserFormState,
  type UserPreset,
  applyUserPreset,
  countAdminUsersInStateForm
} from "@/lib/contracts/state-form";
import { KeyRound, Plus, ShieldUser, UserCog, UsersRound } from "lucide-react";

function AdminSignerUserEditor({
  user,
  onChange,
  onRemove
}: {
  user: UserFormState;
  onChange: (value: UserFormState) => void;
  onRemove: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
  // `useId` rather than a row index: this editor and the spender one below render the
  // same field names, and two lists both starting at 0 would emit duplicate ids.
  const uid = useId();
  const isCustomPreset = user.preset === "custom";
  const approvalPower = approvalPowerForUser(user);

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{personLabel("Person", user)}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={user.isAdmin ? "secondary" : "outline"}>
              {user.isAdmin ? i18n("owner") : i18n("spender")}
            </Badge>
            {/* This said "Signer power", which named the stored field instead of the
                effect, and read the same whether the box below held 5 or nothing at
                all. It now shows the number the contract will count. */}
            <Badge variant={approvalPower > 0 ? "secondary" : "outline"}>
              {approvalPower > 0 ? i18n("approvalPowerApprovalpower", { approvalPower: approvalPower }) : i18n("noApprovalPower")}
            </Badge>
            <Badge variant="outline">
              {formatCountLabel(user.wallets.length, "linked wallet")}
            </Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("remove")}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-preset`}>{i18n("role")}</Label>
          <Select
            id={`${uid}-preset`}
            value={user.preset}
            onChange={(event) => onChange(applyUserPreset(user, event.target.value as UserPreset))}
          >
            <option value="admin">{i18n("owner")}</option>
            <option value="limited-withdrawal">{i18n("spenderWithADailyLimit")}</option>
            <option value="custom">{i18n("custom")}</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            {i18n("anOwnerCanChangeEveryWalletSettingAnd")}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-cosign-rule`}>{i18n("countsTowardApprovals")}</Label>
          <Select
            id={`${uid}-cosign-rule`}
            value={user.multiSigPowerMode}
            onChange={(event) =>
              onChange(withApprovalPowerEnabled(user, event.target.value === "some"))
            }
          >
            <option value="none">{i18n("no")}</option>
            <option value="some">{i18n("yes")}</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-cosign-weight`}>{i18n("approvalPower")}</Label>
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
              ? i18n("setCountsTowardApprovalsToYesToGive")
              : i18n("addedUpWithEveryoneElseWhoApprovesZero")}
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
                onChange(withUserAdminEnabled(user, event.target.checked))
              }
            />
            {i18n("owner")}
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
             * proof of life, and the action that pushes it out is a check-in
             * (`guided-action-adapters.ts:159-163`). An owner always holds this right
             * (`lib/contracts/state-form.ts:276`), which is why the box locks on.
             */}
            {i18n("canCheckInToRefreshTheProofOf")}
            {user.isAdmin ? (
              <span className="text-xs text-muted-foreground">{i18n("everyOwnerCan")}</span>
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
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
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
              {isAdminPreset ? i18n("ownerNoDailyLimit") : i18n("spender")}
            </Badge>
            <Badge variant="outline">
              {formatCountLabel(user.wallets.length, "linked wallet")}
            </Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("remove")}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-preset`}>{i18n("role")}</Label>
          <Select
            id={`${uid}-preset`}
            value={user.preset}
            onChange={(event) => onChange(applyUserPreset(user, event.target.value as UserPreset))}
          >
            <option value="limited-withdrawal">{i18n("spenderWithADailyLimit")}</option>
            <option value="custom">{i18n("custom")}</option>
            <option value="admin">{i18n("owner")}</option>
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
            label={i18n("limitResetsAfter")}
            value={user.nextAllowanceReset}
            onChange={(nextAllowanceReset) => onChange({ ...user, nextAllowanceReset })}
            helper={i18n("theFirstPaymentMadeAfterThisTimeGets")}
          />
        </div>
      </div>
      {isAdminPreset ? (
        // The two allowance editors used to vanish here with nothing said. A reader who
        // had just typed a limit and then chose Owner saw their work disappear.
        <p className="text-xs text-muted-foreground">
          {i18n("anOwnerSpendsWithoutADailyLimitSo")}
        </p>
      ) : (
        <>
          <StateAssetAmountListEditor
            label={i18n("dailyLimit")}
            helper={i18n("howMuchThisPersonCanSpendEachDay")}
            value={user.perDayAllowance}
            onChange={(perDayAllowance) => onChange({ ...user, perDayAllowance })}
          />
          <StateAssetAmountListEditor
            label={i18n("leftToSpend")}
            helper={i18n("whatIsLeftOfTheDailyLimitRight")}
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
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
  // The field holds the payment key hash of a Cardano wallet, and the app already works
  // that value out for whoever is signed in: `wallet-provider.tsx:183` stores it, and
  // `action-validation.ts:143` matches a person's list against it. Asking a reader to
  // find and paste the same hex by hand was the only way to fill this in.
  const activePaymentKeyHash = useAtomValue(activePaymentKeyHashAtom);
  const alreadyLinked =
    activePaymentKeyHash !== null && user.wallets.includes(activePaymentKeyHash);

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{personLabel("Person", user)}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={user.isAdmin ? "secondary" : "outline"}>
              {user.isAdmin ? i18n("owner") : i18n("spender")}
            </Badge>
            <Badge variant="outline">
              {formatCountLabel(user.wallets.length, "linked wallet")}
            </Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("remove")}
        </Button>
      </div>
      <WalletHashesEditor
        label={i18n("walletsThisPersonSignsWith")}
        helper={i18n("thisPersonCanOnlyUseTheSmartWallet")}
        value={user.wallets}
        onChange={(wallets) => onChange({ ...user, wallets })}
        addLabel={i18n("addAWallet")}
        emptyLabel={i18n("noWalletAddedYetSoThisPersonCannot")}
        placeholder={i18n("cardanoWalletId")}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={activePaymentKeyHash === null || alreadyLinked}
          onClick={() =>
            activePaymentKeyHash === null
              ? undefined
              : onChange({ ...user, wallets: [...user.wallets, activePaymentKeyHash] })
          }
        >
          {i18n("useTheWalletIAmSignedInWith")}
        </Button>
        <p className="text-xs text-muted-foreground">
          {activePaymentKeyHash === null
            ? i18n("connectACardanoWalletToFillThisIn")
            : alreadyLinked
              ? i18n("thisPersonAlreadyHasTheWalletYouAre")
              : i18n("addsTheIdOfTheWalletYouAre")}
        </p>
      </div>
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
  const tasks = GUIDED_ADMIN_TASKS.filter((task) => task.group === "manage-people");
  const adminCount = countAdminUsersInStateForm(value);
  const walletAssignedCount = value.users.filter((user) => user.wallets.length > 0).length;
  const issueCount = countFieldErrorMessages(fieldErrors);

  const addAdminUser = () =>
    onChange(withUserAdded(value, "admin"));
  const addSpendingUser = () =>
    onChange(withUserAdded(value, "limited-withdrawal"));

  return (
    <FocusedTaskSurface
      title={i18n("people")}
      description={i18n("ownersSpendersAndTheWalletsLinkedToThem")}
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
              {i18n("everyoneInThisWalletChangeAnyoneHereTo")}
            </p>
            <Button type="button" variant="secondary" onClick={addAdminUser}>
              <Plus className="h-4 w-4" />
              {i18n("addOwner")}
            </Button>
          </div>
          {value.users.length === 0 ? (
            <TaskEmptyState
              icon={ShieldUser}
              title={i18n("nobodyCanChangeThisWallet")}
              description={i18n("addTheFirstOwnerAnOwnerCanChange")}
              actionLabel={i18n("addOwner")}
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
              {i18n("everyoneInThisWalletAndWhatEachOne")}
            </p>
            <Button type="button" variant="secondary" onClick={addSpendingUser}>
              <Plus className="h-4 w-4" />
              {i18n("addSpender")}
            </Button>
          </div>
          {value.users.length === 0 ? (
            <TaskEmptyState
              icon={UserCog}
              title={i18n("nobodyCanSpendFromThisWalletYet")}
              description={i18n("addASpenderThenSetHowMuchThey")}
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
            {/* "Edit linked wallets only." said nothing about what a linked wallet is,
                which is the one thing this tab has to explain. And the button said
                "Add person" while calling `addSpendingUser`, so it always made a
                spender. It now says which. */}
            <p className="text-sm text-muted-foreground">
              {i18n("aCardanoWalletHasToBeLinkedTo")}
            </p>
            <Button type="button" variant="secondary" onClick={addSpendingUser}>
              <Plus className="h-4 w-4" />
              {i18n("addSpender")}
            </Button>
          </div>
          {value.users.length === 0 ? (
            <TaskEmptyState
              icon={KeyRound}
              title={i18n("nobodyIsInThisWalletYet")}
              description={i18n("addASpenderThenLinkTheCardanoWallet")}
              actionLabel={i18n("addSpender")}
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
