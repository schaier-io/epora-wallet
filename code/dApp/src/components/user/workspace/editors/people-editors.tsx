"use client";

import { useId } from "react";

import { StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";
import { GuidedDateTimeField } from "./guided-fields";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { personLabel } from "@/lib/contracts/person-label";
import { type BeneficiaryFormState, type StateFormState, type UserFormState, type UserPreset, applyUserPreset } from "@/lib/contracts/state-form";

export function UserEditor({
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
  // `useId` rather than the row `index`: the same editor is mounted from more than one
  // surface, and two lists both starting at 0 would emit duplicate ids.
  const uid = useId();
  const isAdminPreset = user.preset === "admin";
  const isLimitedWithdrawalPreset = user.preset === "limited-withdrawal";
  const isCustomPreset = user.preset === "custom";

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">{personLabel("Person", user)}</p>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove User
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-preset`}>User Preset</Label>
          <Select
            id={`${uid}-preset`}
            value={user.preset}
            onChange={(event) =>
              onChange(
                applyUserPreset(user, event.target.value as UserPreset)
              )
            }
          >
            <option value="admin">Admin</option>
            <option value="limited-withdrawal">Daily limit spender</option>
            <option value="custom">Custom</option>
          </Select>
        </div>
        <div className="space-y-1">
          <GuidedDateTimeField
            idPrefix={`user-${index}-next-allowance-reset`}
            label="Limit resets on"
            value={user.nextAllowanceReset}
            onChange={(nextAllowanceReset) => onChange({ ...user, nextAllowanceReset })}
            helper="Pick the next local date and time when the user's allowance should reset."
          />
        </div>
        {isCustomPreset ? (
          <>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-cosign-rule`}>Co-sign rule</Label>
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
                <option value="none">None</option>
                <option value="some">Some</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-cosign-weight`}>Co-sign weight</Label>
              <Input
                id={`${uid}-cosign-weight`}
                value={user.multiSigPower}
                onChange={(event) => onChange({ ...user, multiSigPower: event.target.value })}
                disabled={user.multiSigPowerMode === "none"}
                placeholder="0"
              />
            </div>
          </>
        ) : null}
      </div>
      {isCustomPreset ? (
        <div className="flex flex-wrap gap-4">
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
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={user.isAdmin}
              onChange={(event) =>
                onChange({
                  ...user,
                  isAdmin: event.target.checked,
                  canRenewProofOfLife:
                    event.target.checked ? true : user.canRenewProofOfLife
                })
              }
            />
            Admin
          </label>
        </div>
      ) : null}
      <WalletHashesEditor
        label="User Wallets"
        value={user.wallets}
        onChange={(wallets) => onChange({ ...user, wallets })}
      />
      {!isAdminPreset ? (
        <>
          <StateAssetAmountListEditor
            label="Daily limit"
            helper={
              isLimitedWithdrawalPreset
                ? "These allowances apply to limited-withdrawal users."
                : "Configure the asset-based daily withdrawal allowance."
            }
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
      {isCustomPreset && user.isAdmin ? (
        <p className="text-xs text-muted-foreground">
          Owners can always extend recovery. The actual wake-up timer date is taken from the Wake-up timer fields above, or from the override when you set one.
        </p>
      ) : null}
    </div>
  );
}

export function BeneficiaryEditor({
  beneficiary,
  index,
  totalWeight,
  onChange,
  onRemove
}: {
  beneficiary: BeneficiaryFormState;
  index: number;
  totalWeight: number;
  onChange: (value: BeneficiaryFormState) => void;
  onRemove: () => void;
}) {
  const uid = useId();
  const ownWeight = Number.parseInt(beneficiary.weight, 10);
  const sharePercent =
    Number.isFinite(ownWeight) && ownWeight > 0 && totalWeight > 0
      ? ((ownWeight / totalWeight) * 100).toFixed(1)
      : null;
  const hasExtraWait = beneficiary.unlockAfterMode === "some";

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">{personLabel("Recovery contact", beneficiary)}</p>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove recovery contact
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          {/* "Weight" and "distributable pool" name the on-chain field and the contract's
              own word for the money. `Beneficiary.weight`
              (`smart-contract/lib/state/types.ak:42-48`) is a share against the other
              contacts: this person may take
              `weight / (sum of weights still present) × (wallet value − scheduled-payment
              reserve)`, and is then removed from the state. */}
          <Label htmlFor={`${uid}-weight`}>Share</Label>
          <Input
            id={`${uid}-weight`}
            type="number"
            min={1}
            step={1}
            value={beneficiary.weight}
            onChange={(event) =>
              onChange({ ...beneficiary, weight: event.target.value })
            }
            placeholder="1"
          />
          <p className="text-xs text-muted-foreground">
            {sharePercent
              ? `Takes about ${sharePercent}% of what the wallet holds once scheduled payments are covered (${ownWeight} of ${totalWeight} across every recovery contact). They can take it once, and are then removed.`
              : "A bigger number takes a bigger share. Somebody on 2 takes twice as much as somebody on 1. They can take their share once, and are then removed."}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-unlock-mode`}>Make this person wait longer</Label>
          <Select
            id={`${uid}-unlock-mode`}
            value={beneficiary.unlockAfterMode}
            onChange={(event) =>
              onChange({
                ...beneficiary,
                unlockAfterMode: event.target.value as "none" | "some"
              })
            }
          >
            <option value="none">No</option>
            <option value="some">Yes</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            {hasExtraWait
              ? "This person also has to wait for the date below."
              : "This person can act as soon as the wake-up timer runs out."}
          </p>
        </div>
        <div className="space-y-1">
          {/* The date is a second gate, not the only one. A recovery contact needs BOTH
              the wallet's wake-up timer to have run out AND their own `unlock_after` to
              have passed (`smart-contract/lib/state/types.ak:39-41`). The old helper
              named only this one, so it read as the whole rule. */}
          <GuidedDateTimeField
            idPrefix={`beneficiary-${index}-unlock-after`}
            label="Cannot act before"
            value={beneficiary.unlockAfter}
            onChange={(unlockAfter) => onChange({ ...beneficiary, unlockAfter })}
            disabled={!hasExtraWait}
            helper={
              hasExtraWait
                ? "Even after the wake-up timer runs out, this person can take nothing until this time."
                : "Set the field beside this to Yes to hold this person back until a date."
            }
          />
        </div>
      </div>
      <WalletHashesEditor
        label="Wallets this person signs with"
        helper="This person can only claim their share from a Cardano wallet listed here."
        value={beneficiary.wallets}
        onChange={(wallets) => onChange({ ...beneficiary, wallets })}
        addLabel="Add a wallet"
        emptyLabel="No wallet added yet, so this person could not claim anything."
        placeholder="Cardano wallet id"
      />
    </div>
  );
}

export function MultisigThresholdEditor({
  value,
  onChange
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
}) {
  const uid = useId();

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-approval-rule`}>Approval rule</Label>
          <Select
            id={`${uid}-approval-rule`}
            value={value.multiSigThresholdMode}
            onChange={(event) =>
              onChange({
                ...value,
                multiSigThresholdMode: event.target.value as "none" | "some"
              })
            }
          >
            <option value="none">None</option>
            <option value="some">Some</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-required-approvals`}>Required approvals</Label>
          <Input
            id={`${uid}-required-approvals`}
            value={value.multiSigThreshold}
            onChange={(event) => onChange({ ...value, multiSigThreshold: event.target.value })}
            disabled={value.multiSigThresholdMode === "none"}
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );
}
