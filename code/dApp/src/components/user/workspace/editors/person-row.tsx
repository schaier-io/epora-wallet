"use client";
import { useAtomValue } from "jotai";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { ChevronDown, ShieldUser, UserRound } from "lucide-react";

import { DestructiveRemoveButton } from "./destructive-remove-button";
import { PermissionChip } from "./permission-chip";
import { CoSignerGroup, RecoveryGroup, SpenderGroup, WalletsGroup } from "./person-permission-groups";
import { PersonHeading } from "./person-heading";
import { useSpenderPermissionDraft } from "./use-spender-permission-draft";
import {
  personKeyForContact,
  personPermissions,
  personWallets,
  withOwnerToggled,
  withoutRecoveryContact,
  withPersonRemoved,
  withPersonUserEdited,
  withRecoveryContactForUser,
  type PersonEntry
} from "@/components/user/workspace/helpers/people-model";
import { canAddAllowanceEntryInStateForm, createDefaultUserFormState, type StateFormState, type UserFormState } from "@/lib/contracts/state-form";
import {
  MAX_ACCESS_RECORDS,
  MAX_BENEFICIARIES,
  MAX_TOTAL_ALLOWANCE_ENTRIES,
  MAX_TOTAL_USER_WALLETS,
  MAX_USERS,
  MAX_WALLETS_PER_USER
} from "@/lib/contracts/state-validation";
import { countWalletEntries } from "@/lib/contracts/wallet-capacity";
import { personLabel } from "@/lib/contracts/person-label";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { cn } from "@/lib/utils/cn";

// The hook keeps a person's limits when Spender is switched off and back on. It needs a
// user record to work on, so a recovery contact without one gets a stand-in that is
// never written: pressing Spender there goes through `withPersonUserEdited` instead.
const NO_USER = { id: "", wallets: [], perDayAllowance: [], remainingAllowance: [] } as unknown as UserFormState;

/** What a control is called: a field by its label, a button by its label or text. */
function controlName(element: Element | null): string | null {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    return element.labels?.[0]?.textContent ?? element.getAttribute("aria-label");
  }
  return element?.getAttribute("aria-label") ?? element?.textContent ?? null;
}

/**
 * One person: a line with what they may do, and, once opened, a chip per permission
 * with that permission's settings underneath. The chips speak in people's terms; the
 * records behind them (a user, a recovery contact, or both) are the model's concern.
 */
export function PersonRow({
  value,
  person,
  open,
  onOpenChange,
  onChange
}: {
  value: StateFormState;
  person: PersonEntry;
  open: boolean;
  onOpenChange: (key: string | null) => void;
  onChange: (value: StateFormState) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPersonRow");
  const people = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
  const contact = useTranslations("ComponentsUserWorkspaceEditorsPeopleEditors");
  const uid = useId();
  const activePaymentKeyHash = useAtomValue(activePaymentKeyHashAtom);
  const activeAddress = useAtomValue(activeAddressAtom);
  const user = person.userIndex === null ? null : value.users[person.userIndex];
  const beneficiary = person.beneficiaryIndex === null ? null : value.beneficiaries[person.beneficiaryIndex];
  const permissions = personPermissions(value, person);
  const wallets = personWallets(value, person);
  const record = user ?? beneficiary ?? { id: "", wallets: [] };
  const name = personLabel(people("person"), record);
  const timerOn =
    value.proofOfLifeUnlockTimeMode === "some" || value.beneficiaries.length > 0;
  const records = value.users.length + value.beneficiaries.length;
  // Records join into one person through a shared wallet, so a person without one
  // cannot gain the second record yet: it would show up as somebody else.
  const hasWallet = wallets.some((wallet) => wallet.trim().length > 0);
  // A contact who gains a user permission brings their wallets into `users`.
  const canAddUser =
    user !== null ||
    (hasWallet &&
      value.users.length < MAX_USERS &&
      records < MAX_ACCESS_RECORDS &&
      countWalletEntries(value.users) + wallets.length <= MAX_TOTAL_USER_WALLETS);
  const canAddContact =
    hasWallet && value.beneficiaries.length < MAX_BENEFICIARIES && records < MAX_ACCESS_RECORDS;
  const canAddDaily =
    person.userIndex === null
      ? canAddAllowanceEntryInStateForm(
          { ...value, users: [...value.users, createDefaultUserFormState("")] },
          value.users.length,
          "perDayAllowance",
          MAX_TOTAL_ALLOWANCE_ENTRIES
        )
      : canAddAllowanceEntryInStateForm(value, person.userIndex, "perDayAllowance", MAX_TOTAL_ALLOWANCE_ENTRIES);

  // A permission that moves the person to another record also moves their row, which
  // remounts it. Focus follows the pressed chip into the new row.
  const moveRow = (key: string | null) => {
    const active = document.activeElement;
    const fromThisRow = active?.closest(`[data-person-key="${person.key}"]`) != null;
    const name = controlName(active);
    onOpenChange(key);
    if (!key || key === person.key || !fromThisRow) return;
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-person-key="${key}"]`);
      const controls = Array.from(row?.querySelectorAll<HTMLElement>("button, input, select, textarea") ?? []);
      const usable = (control: HTMLElement) =>
        !control.hasAttribute("disabled") && control.closest("details:not([open])") === null;
      // The same control when the new row can take focus there, else the row's own toggle.
      const target =
        controls.find((control) => name !== null && usable(control) && controlName(control) === name) ??
        row?.querySelector<HTMLElement>("button[aria-expanded]");
      target?.focus();
    });
  };
  const editUser = (edit: (user: UserFormState) => UserFormState) => {
    const next = withPersonUserEdited(value, person, edit);
    // The person may have changed records: a contact who gained a user record, or a
    // user record dropped because it granted nothing beside a recovery contact. While
    // the user record stays, its row stays open, even if a wallet edit splits off the
    // contact: the field being typed in must not unmount.
    const kept = user !== null && next.users.some((entry) => entry.id === user.id);
    if (beneficiary && !kept) moveRow(personKeyForContact(next, beneficiary.id));
    onChange(next);
  };
  const toggleSpenderOnUser = useSpenderPermissionDraft(
    user ?? NO_USER,
    (next) => editUser(() => next),
    canAddDaily
  );
  const toggleSpender = () =>
    user
      ? toggleSpenderOnUser()
      : editUser((created) => ({
          ...created,
          perDayAllowance: [{ policyId: "", assetName: "", amount: "" }]
        }));
  const toggleRecovery = () => {
    if (beneficiary && person.beneficiaryIndex !== null) {
      onChange(withoutRecoveryContact(value, person.beneficiaryIndex));
      return;
    }
    if (person.userIndex === null || !user) return;
    // The connected wallet's address is the one address this screen knows for sure
    // belongs to a key this person signs with.
    const payout =
      activePaymentKeyHash && activeAddress && user.wallets.includes(activePaymentKeyHash)
        ? activeAddress
        : "";
    const next = withRecoveryContactForUser(value, person.userIndex, Date.now(), payout);
    const added = next.beneficiaries[next.beneficiaries.length - 1];
    moveRow(personKeyForContact(next, added.id));
    onChange(next);
  };

  const summary = permissions.owner
    ? i18n("ownerFullControl")
    : [
        permissions.coSigner && people("cosigner"),
        permissions.spender && people("spender"),
        permissions.checkIn && people("checkIn"),
        permissions.recoveryContact && contact("recoveryContact")
      ]
        .filter(Boolean)
        .join(" · ") || i18n("noPermissionsYet");
  // An owner may do everything alone, so the other chips only show while one is still
  // on (a wallet saved before this screen), where pressing it is how it goes away.
  const shows = (on: boolean) => !permissions.owner || on;

  return (
    <li data-person-key={person.key} className="border-t border-border/60 first:border-t-0">
      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6">
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            permissions.owner ? "bg-primary/12 text-primary" : "bg-muted/60 text-muted-foreground"
          )}
        >
          {permissions.owner ? (
            <ShieldUser className="h-4 w-4" aria-hidden="true" />
          ) : (
            <UserRound className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <PersonHeading person={record}>{name}</PersonHeading>
          <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${uid}-details`}
          aria-label={open ? i18n("hideDetailsFor", { name }) : i18n("showDetailsFor", { name })}
          onClick={() => onOpenChange(open ? null : person.key)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>
      {open ? (
        <div id={`${uid}-details`} className="space-y-4 px-4 pb-6 sm:pl-18 sm:pr-6">
          <div className="space-y-2">
            <p className="eyebrow text-muted-foreground">{people("permissions")}</p>
            <div className="flex flex-wrap gap-2">
              <PermissionChip
                label={people("owner")}
                pressed={permissions.owner}
                disabled={!canAddUser}
                onClick={() => editUser((edited) => withOwnerToggled(edited, !edited.isAdmin))}
                title={people("anOwnerCanChangeEveryWalletSettingAnd")}
              />
              {shows(permissions.coSigner) ? (
                <PermissionChip
                  label={people("cosigner")}
                  pressed={permissions.coSigner}
                  disabled={!canAddUser}
                  onClick={() =>
                    editUser((edited) =>
                      edited.multiSigPowerMode === "some"
                        ? { ...edited, multiSigPowerMode: "none", preset: "custom" }
                        : { ...edited, multiSigPowerMode: "some", multiSigPower: edited.multiSigPower.trim() || "1", preset: "custom" }
                    )
                  }
                  title={people("countsTowardApprovals")}
                />
              ) : null}
              {shows(permissions.spender) ? (
                <PermissionChip
                  label={people("spender")}
                  pressed={permissions.spender}
                  disabled={!canAddUser || (!permissions.spender && !canAddDaily)}
                  onClick={toggleSpender}
                  title={people("howMuchThisPersonCanSpendEachDay")}
                />
              ) : null}
              {/* Check-in keeps the proof of life running, so it only means something
                  while there is one. */}
              {!permissions.owner && (timerOn || permissions.checkIn) ? (
                <PermissionChip
                  label={people("checkIn")}
                  pressed={permissions.checkIn}
                  disabled={!canAddUser}
                  onClick={() =>
                    editUser((edited) => ({ ...edited, canRenewProofOfLife: !edited.canRenewProofOfLife, preset: "custom" }))
                  }
                  title={people("canCheckInToRefreshTheProofOf")}
                />
              ) : null}
              {shows(permissions.recoveryContact) ? (
                <PermissionChip
                  label={contact("recoveryContact")}
                  pressed={permissions.recoveryContact}
                  // A contact with no user record has nothing else: Remove is the way out.
                  disabled={(permissions.recoveryContact && !user) || (!permissions.recoveryContact && !canAddContact)}
                  onClick={toggleRecovery}
                  title={i18n("recoveryContactHint")}
                />
              ) : null}
            </div>
            {permissions.owner ? <p className="text-xs text-muted-foreground">{i18n("ownerNote")}</p> : null}
            {!hasWallet ? (
              <p className="text-xs text-muted-foreground">{i18n("linkAWalletFirst")}</p>
            ) : records >= MAX_ACCESS_RECORDS && (!user || !permissions.recoveryContact) ? (
              <p className="text-xs text-muted-foreground">
                {i18n("thisWalletAlreadyHoldsMaxRecords", { max: MAX_ACCESS_RECORDS })}
              </p>
            ) : null}
          </div>

          {user && permissions.coSigner ? (
            <CoSignerGroup value={value} user={user} onChange={(next) => editUser(() => next)} />
          ) : null}
          {user && permissions.spender && !permissions.owner ? (
            <SpenderGroup
              user={user}
              onChange={(next) => editUser(() => next)}
              canAddPerDayAllowanceEntry={canAddDaily}
              canAddRemainingAllowanceEntry={
                person.userIndex !== null &&
                canAddAllowanceEntryInStateForm(value, person.userIndex, "remainingAllowance", MAX_TOTAL_ALLOWANCE_ENTRIES)
              }
            />
          ) : null}
          {beneficiary && person.beneficiaryIndex !== null ? (
            <RecoveryGroup
              beneficiary={beneficiary}
              linkedWallets={user ? user.wallets : null}
              totalWeight={value.beneficiaries.reduce(
                (sum, entry) => sum + (Number.parseInt(entry.weight, 10) || 0),
                0
              )}
              onChange={(next) => {
                const nextForm = {
                  ...value,
                  beneficiaries: value.beneficiaries.map((entry, index) =>
                    index === person.beneficiaryIndex ? next : entry
                  )
                };
                // A payout to another wallet splits the person; stay on the contact.
                moveRow(personKeyForContact(nextForm, next.id));
                onChange(nextForm);
              }}
            />
          ) : null}
          {/* A contact signs with the key in its payout address, set above. */}
          {user ? (
            <WalletsGroup
              wallets={wallets}
              onChange={(nextWallets) => editUser((edited) => ({ ...edited, wallets: nextWallets }))}
              canAddWallet={
                countWalletEntries(value.users) < MAX_TOTAL_USER_WALLETS &&
                wallets.length < MAX_WALLETS_PER_USER
              }
            />
          ) : null}

          <div className="flex justify-end">
            <DestructiveRemoveButton
              label={people("remove")}
              confirmTitle={people("removeConfirmTitle")}
              confirmBody={people("removeConfirmBody")}
              cancelLabel={people("cancel")}
              onConfirm={() => {
                onOpenChange(null);
                onChange(withPersonRemoved(value, person));
              }}
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}
