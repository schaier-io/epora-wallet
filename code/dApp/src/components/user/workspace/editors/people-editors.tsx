"use client";

import { StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";
import { GuidedDateTimeField } from "./guided-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const isAdminPreset = user.preset === "admin";
  const isLimitedWithdrawalPreset = user.preset === "limited-withdrawal";
  const isCustomPreset = user.preset === "custom";

  return (
    <div className="space-y-4 rounded-md border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">User {index + 1}</p>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove User
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5">
          <Label>User Preset</Label>
          <select
            value={user.preset}
            onChange={(event) =>
              onChange(
                applyUserPreset(user, event.target.value as UserPreset)
              )
            }
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="admin">Admin</option>
            <option value="limited-withdrawal">Daily limit spender</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div className="space-y-1.5">
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
  const ownWeight = Number.parseInt(beneficiary.weight, 10);
  const sharePercent =
    Number.isFinite(ownWeight) && ownWeight > 0 && totalWeight > 0
      ? ((ownWeight / totalWeight) * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-4 rounded-md border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">Recovery contact {index + 1}</p>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove recovery contact
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Weight</Label>
          <Input
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
              ? `Share of the distributable pool: ~${sharePercent}% (weight ${ownWeight} of ${totalWeight}). Withdrawal is one-shot.`
              : "Proportional share of the distributable pool (integer ≥ 1). Withdrawal is one-shot."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Unlock After Mode</Label>
          <select
            value={beneficiary.unlockAfterMode}
            onChange={(event) =>
              onChange({
                ...beneficiary,
                unlockAfterMode: event.target.value as "none" | "some"
              })
            }
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="none">None</option>
            <option value="some">Some</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <GuidedDateTimeField
            idPrefix={`beneficiary-${index}-unlock-after`}
            label="Unlock After"
            value={beneficiary.unlockAfter}
            onChange={(unlockAfter) => onChange({ ...beneficiary, unlockAfter })}
            disabled={beneficiary.unlockAfterMode === "none"}
            helper="Choose the local date and time after which this beneficiary path can unlock."
          />
        </div>
      </div>
      <WalletHashesEditor
        label="Recovery contact wallets"
        value={beneficiary.wallets}
        onChange={(wallets) => onChange({ ...beneficiary, wallets })}
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
  return (
    <div className="user-surface user-list-item space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Approval rule</Label>
          <select
            value={value.multiSigThresholdMode}
            onChange={(event) =>
              onChange({
                ...value,
                multiSigThresholdMode: event.target.value as "none" | "some"
              })
            }
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="none">None</option>
            <option value="some">Some</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Required approvals</Label>
          <Input
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
