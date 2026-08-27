"use client";
import { useTranslations } from "next-intl";


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
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPeopleEditors");
  const isAdminPreset = user.preset === "admin";
  const isLimitedWithdrawalPreset = user.preset === "limited-withdrawal";
  const isCustomPreset = user.preset === "custom";
  const presetId = `user-${index}-preset`;
  const coSignRuleId = `user-${index}-co-sign-rule`;
  const coSignWeightId = `user-${index}-co-sign-weight`;

  return (
    <div className="space-y-4 rounded-md border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">{i18n("person")} {index + 1}</p>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("removePerson")}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={presetId}>{i18n("role")}</Label>
          <select
            id={presetId}
            value={user.preset}
            onChange={(event) =>
              onChange(
                applyUserPreset(user, event.target.value as UserPreset)
              )
            }
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="admin">{i18n("owner")}</option>
            <option value="limited-withdrawal">{i18n("dailyLimitSpender")}</option>
            <option value="custom">{i18n("custom")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <GuidedDateTimeField
            idPrefix={`user-${index}-next-allowance-reset`}
            label={i18n("limitResetsOn")}
            value={user.nextAllowanceReset}
            onChange={(nextAllowanceReset) => onChange({ ...user, nextAllowanceReset })}
            helper={i18n("pickTheNextLocalDateAndTimeWhen")}
          />
        </div>
        {isCustomPreset ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={coSignRuleId}>{i18n("approvalRule")}</Label>
              <select
                id={coSignRuleId}
                value={user.multiSigPowerMode}
                onChange={(event) =>
                  onChange({
                    ...user,
                    multiSigPowerMode: event.target.value as "none" | "some"
                  })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="none">{i18n("none")}</option>
                <option value="some">{i18n("setAWeight")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={coSignWeightId}>{i18n("approvalWeight")}</Label>
              <Input
                id={coSignWeightId}
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
            {i18n("canRefreshTheWakeUpTimer")}
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
            {i18n("owner")}
          </label>
        </div>
      ) : null}
      <WalletHashesEditor
        label={i18n("signerKeys")}
        value={user.wallets}
        onChange={(wallets) => onChange({ ...user, wallets })}
      />
      {!isAdminPreset ? (
        <>
          <StateAssetAmountListEditor
            label={i18n("dailyLimit")}
            helper={
              isLimitedWithdrawalPreset
                ? i18n("setHowMuchThisSpenderCanSendPer")
                : i18n("setADailySpendingLimitForEachAsset")
            }
            value={user.perDayAllowance}
            onChange={(perDayAllowance) => onChange({ ...user, perDayAllowance })}
          />
          <StateAssetAmountListEditor
            label={i18n("remainingAllowance")}
            helper={i18n("amountThisSpenderCanStillSendBeforeThe")}
            value={user.remainingAllowance}
            onChange={(remainingAllowance) => onChange({ ...user, remainingAllowance })}
          />
        </>
      ) : null}
      {isCustomPreset && user.isAdmin ? (
        <p className="text-xs text-muted-foreground">
          {i18n("ownersCanRefreshTheWakeUpTimerThe")}
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
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPeopleEditors");
  const ownWeight = Number.parseInt(beneficiary.weight, 10);
  const sharePercent =
    Number.isFinite(ownWeight) && ownWeight > 0 && totalWeight > 0
      ? ((ownWeight / totalWeight) * 100).toFixed(1)
      : null;
  const weightId = `beneficiary-${index}-weight`;
  const unlockModeId = `beneficiary-${index}-unlock-mode`;

  return (
    <div className="space-y-4 rounded-md border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">{i18n("recoveryContact")} {index + 1}</p>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("removeRecoveryContact")}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={weightId}>{i18n("recoveryShareWeight")}</Label>
          <Input
            id={weightId}
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
              ? i18n("shareOfTheDistributablePoolSharepercentWeightOwnweight", { sharePercent: sharePercent, ownWeight: ownWeight, totalWeight: totalWeight })
              : i18n("proportionalShareOfTheDistributablePoolInteger1")}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={unlockModeId}>{i18n("unlockDate")}</Label>
          <select
            id={unlockModeId}
            value={beneficiary.unlockAfterMode}
            onChange={(event) =>
              onChange({
                ...beneficiary,
                unlockAfterMode: event.target.value as "none" | "some"
              })
            }
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="none">{i18n("noPersonalDelay")}</option>
            <option value="some">{i18n("setADate")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <GuidedDateTimeField
            idPrefix={`beneficiary-${index}-unlock-after`}
            label={i18n("recoveryAvailableAfter")}
            value={beneficiary.unlockAfter}
            onChange={(unlockAfter) => onChange({ ...beneficiary, unlockAfter })}
            disabled={beneficiary.unlockAfterMode === "none"}
            helper={i18n("chooseWhenThisRecoveryContactCanMakeIts")}
          />
        </div>
      </div>
      <WalletHashesEditor
        label={i18n("recoveryContactSignerKeys")}
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
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPeopleEditors");
  const ruleId = "multisig-approval-rule";
  const thresholdId = "multisig-required-approvals";

  return (
    <div className="user-surface user-list-item space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={ruleId}>{i18n("approvalRule")}</Label>
          <select
            id={ruleId}
            value={value.multiSigThresholdMode}
            onChange={(event) =>
              onChange({
                ...value,
                multiSigThresholdMode: event.target.value as "none" | "some"
              })
            }
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="none">{i18n("none")}</option>
            <option value="some">{i18n("setAWeight")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={thresholdId}>{i18n("requiredApprovalWeight")}</Label>
          <Input
            id={thresholdId}
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
