"use client";
import { useTranslations } from "next-intl";


import { useId } from "react";

import { StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";
import { GuidedDateTimeField } from "./guided-fields";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  reachableApprovalPower,
  withApprovalPowerEnabled,
  withMultiApprovalEnabled,
  withUserAdminEnabled
} from "@/components/user/workspace/helpers/form-state";
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
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPeopleEditors");
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
          {i18n("removeUser")}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-preset`}>{i18n("userPreset")}</Label>
          <Select
            id={`${uid}-preset`}
            value={user.preset}
            onChange={(event) =>
              onChange(
                applyUserPreset(user, event.target.value as UserPreset)
              )
            }
          >
            <option value="admin">{i18n("admin")}</option>
            <option value="limited-withdrawal">{i18n("dailyLimitSpender")}</option>
            <option value="custom">{i18n("custom")}</option>
          </Select>
        </div>
        <div className="space-y-1">
          <GuidedDateTimeField
            idPrefix={`user-${index}-next-allowance-reset`}
            label={i18n("limitResetsOn")}
            value={user.nextAllowanceReset}
            onChange={(nextAllowanceReset) => onChange({ ...user, nextAllowanceReset })}
            helper={i18n("pickTheNextLocalDateAndTimeWhen_8e6015")}
          />
        </div>
        {isCustomPreset ? (
          <>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-cosign-rule`}>{i18n("coSignRule")}</Label>
              <Select
                id={`${uid}-cosign-rule`}
                value={user.multiSigPowerMode}
                onChange={(event) =>
                  onChange(withApprovalPowerEnabled(user, event.target.value === "some"))
                }
              >
                <option value="none">{i18n("none")}</option>
                <option value="some">{i18n("some")}</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-cosign-weight`}>{i18n("coSignWeight")}</Label>
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
            {i18n("canRenewProofOfLive")}
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={user.isAdmin}
              onChange={(event) =>
                onChange(withUserAdminEnabled(user, event.target.checked))
              }
            />
            {i18n("admin")}
          </label>
        </div>
      ) : null}
      <WalletHashesEditor
        label={i18n("userWallets")}
        value={user.wallets}
        onChange={(wallets) => onChange({ ...user, wallets })}
      />
      {!isAdminPreset ? (
        <>
          <StateAssetAmountListEditor
            label={i18n("dailyLimit")}
            helper={
              isLimitedWithdrawalPreset
                ? i18n("theseAllowancesApplyToLimitedWithdrawalUsers")
                : i18n("configureTheAssetBasedDailyWithdrawalAllowance")
            }
            value={user.perDayAllowance}
            onChange={(perDayAllowance) => onChange({ ...user, perDayAllowance })}
          />
          <StateAssetAmountListEditor
            label={i18n("remainingAllowance_1cdfb9")}
            helper={i18n("tracksTheRemainingAllowanceForTheCurrentPeriod")}
            value={user.remainingAllowance}
            onChange={(remainingAllowance) => onChange({ ...user, remainingAllowance })}
          />
        </>
      ) : null}
      {isCustomPreset && user.isAdmin ? (
        <p className="text-xs text-muted-foreground">
          {i18n("ownersCanAlwaysExtendRecoveryTheActualProof")}
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
          {i18n("removeRecoveryContact")}
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
          <Label htmlFor={`${uid}-weight`}>{i18n("share")}</Label>
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
              ? i18n("takesAboutSharepercentOfWhatTheWalletHolds", { sharePercent: sharePercent, ownWeight: ownWeight, totalWeight: totalWeight })
              : i18n("aBiggerNumberTakesABiggerShareSomebody")}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-unlock-mode`}>{i18n("makeThisPersonWaitLonger")}</Label>
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
            <option value="none">{i18n("no")}</option>
            <option value="some">{i18n("yes")}</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            {hasExtraWait
              ? i18n("thisPersonAlsoHasToWaitForThe")
              : i18n("thisPersonCanActAsSoonAsThe")}
          </p>
        </div>
        <div className="space-y-1">
          {/* The date is a second gate, not the only one. A recovery contact needs BOTH
              the wallet's proof of life to have run out AND their own `unlock_after` to
              have passed (`smart-contract/lib/state/types.ak:39-41`). The old helper
              named only this one, so it read as the whole rule. */}
          <GuidedDateTimeField
            idPrefix={`beneficiary-${index}-unlock-after`}
            label={i18n("cannotActBefore")}
            value={beneficiary.unlockAfter}
            onChange={(unlockAfter) => onChange({ ...beneficiary, unlockAfter })}
            disabled={!hasExtraWait}
            helper={
              hasExtraWait
                ? i18n("evenAfterTheProofOfLifeRunsOut")
                : i18n("setTheFieldBesideThisToYesTo")
            }
          />
        </div>
      </div>
      <WalletHashesEditor
        label={i18n("walletsThisPersonSignsWith")}
        helper={i18n("thisPersonCanOnlyClaimTheirShareFrom")}
        value={beneficiary.wallets}
        onChange={(wallets) => onChange({ ...beneficiary, wallets })}
        addLabel={i18n("addAWallet")}
        emptyLabel={i18n("noWalletAddedYetSoThisPersonCould")}
        placeholder={i18n("cardanoWalletId")}
      />
    </div>
  );
}

/**
 * The approval power an action can actually reach. Two contract rules bound it:
 * `has_reachable_access_path` counts a person's `multi_sig_power` only when they also
 * have a wallet to sign with (`smart-contract/lib/state/configuration.ak:302-311`), and
 * `multisig_threshold_is_met` (`:272-296`) adds that power only when it is `Some` and
 * above zero. A threshold above this total is accepted on-chain while an owner exists,
 * but the approval path then never grants anything (`configuration.ak:16-24`), so the
 * screen has to say so: nothing else in the app ever will.
 */
export function MultisigThresholdEditor({
  value,
  onChange
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPeopleEditors");
  const uid = useId();
  const enabled = value.multiSigThresholdMode === "some";
  const availablePower = reachableApprovalPower(value.users);
  const needed = Number.parseInt(value.multiSigThreshold, 10);
  const hasNeeded = Number.isFinite(needed) && needed > 0;

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          {/*
           * This read "Approval rule" over a None/Some pair, which named neither the
           * rule nor what either choice does. "None" is not "no approvals needed": it
           * switches the approval path off, and `multisig_threshold_is_met` then returns
           * `False` for every action (`configuration.ak:295`), leaving the owners as the
           * only people who can act.
           *
           * The threshold also does not constrain an owner. `OperatorPath` is `Admin` OR
           * `Multisig` (`smart-contract/lib/state/types.ak:61-64`) and "Admins always
           * satisfy `has_operator_authority(_, _, Admin)`" (`authorization.ak:21`), so
           * turning this on adds a second way in rather than gating the first. Every
           * word the screen used ("Require", "Required") said the opposite.
           */}
          <Label htmlFor={`${uid}-approval-rule`}>{i18n("letSeveralPeopleActTogether")}</Label>
          <Select
            id={`${uid}-approval-rule`}
            value={enabled ? "some" : "none"}
            onChange={(event) =>
              onChange(withMultiApprovalEnabled(value, event.target.value === "some"))
            }
          >
            <option value="none">{i18n("no")}</option>
            <option value="some">{i18n("yes")}</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? i18n("peopleHoldingEnoughApprovalPowerBetweenThemCan")
              : i18n("onlyTheOwnersCanActForThisWallet")}
          </p>
        </div>
        {enabled ? (
          <div className="space-y-1">
            {/*
             * This read "Required approvals", and the full editor read "Approvals
             * needed". Both counted people. The contract sums each signer's
             * `multi_sig_power` instead (`configuration.ak:272-296`), which is the number
             * the person editor calls approval power, so a wallet where one person holds
             * 2 needs one signer to reach a threshold of 2, not two.
             */}
            <Label htmlFor={`${uid}-required-approvals`}>{i18n("approvalPowerNeeded")}</Label>
            <Input
              id={`${uid}-required-approvals`}
              value={value.multiSigThreshold}
              onChange={(event) =>
                onChange({ ...value, multiSigThreshold: event.target.value })
              }
              placeholder="2"
            />
            <p className="text-xs text-muted-foreground">
              {!hasNeeded
                ? i18n("enterAtLeast1OrNoActionCan")
                : needed > availablePower
                  ? i18n("nobodyCanReachNeededThePeopleWhoCan", { needed: needed, availablePower: availablePower })
                  : i18n("thisAddsUpApprovalPowerNotPeopleThe", { availablePower: availablePower })}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
