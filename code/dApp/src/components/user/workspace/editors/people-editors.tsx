"use client";
import { useTranslations } from "next-intl";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { useAtomValue } from "jotai";


import { useId } from "react";

import { buildKnownAddresses, WalletHashesEditor } from "./asset-editors";
import { GuidedDateTimeField } from "./guided-fields";
import { IntegerPowerSlider } from "./integer-power-slider";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reachableApprovalPower, withCoSignerAdded, withMultisigDerivedFromCoSigners } from "@/components/user/workspace/helpers/form-state";
import { PersonHeading } from "@/components/user/workspace/editors/person-heading";
import { personLabel } from "@/lib/contracts/person-label";
import { type BeneficiaryFormState, type StateFormState } from "@/lib/contracts/state-form";

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
  const activePaymentKeyHash = useAtomValue(activePaymentKeyHashAtom);
  const activeAddress = useAtomValue(activeAddressAtom);
  const ownWeight = Number.parseInt(beneficiary.weight, 10);
  const sharePercent =
    Number.isFinite(ownWeight) && ownWeight > 0 && totalWeight > 0
      ? ((ownWeight / totalWeight) * 100).toFixed(1)
      : null;
  const hasExtraWait = beneficiary.unlockAfterMode === "some";

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PersonHeading person={beneficiary}>{personLabel("Recovery contact", beneficiary)}</PersonHeading>
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
        knownAddresses={buildKnownAddresses(activePaymentKeyHash, activeAddress)}
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
  const activePaymentKeyHash = useAtomValue(activePaymentKeyHashAtom);
  const activeAddress = useAtomValue(activeAddressAtom);
  // The rule has no on/off control of its own any more: it is whoever holds a
  // Co-signer chip. The chips live on the People page, but this editor still offers
  // "Add a co-signer" so turning the rule on never requires a detour.
  const change = (next: StateFormState) =>
    onChange(withMultisigDerivedFromCoSigners(next));
  const availablePower = reachableApprovalPower(value.users);
  const needed = Number.parseInt(value.multiSigThreshold, 10);
  const hasNeeded = Number.isFinite(needed) && needed > 0;
  // The people the threshold counts: the contract sums `multi_sig_power` over the
  // users who opted in (`configuration.ak:272-296`), so these are the co-signers.
  const coSigners = value.users.filter((user) => user.multiSigPowerMode === "some");
  const enabled = coSigners.length > 0;

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="space-y-1">
        {/*
         * This used to be a Yes/No over a None/Some pair, which named neither the
         * rule nor what either choice does — and could disagree with the Co-signer
         * chips it was supposedly summarising. "None" is not "no approvals needed":
         * it switches the approval path off, and `multisig_threshold_is_met` then
         * returns `False` for every action (`configuration.ak:295`). The chips are
         * the rule now, so the question became a heading with the derived answer
         * under it.
         *
         * The threshold also does not constrain an owner. `OperatorPath` is `Admin` OR
         * `Multisig` (`smart-contract/lib/state/types.ak:61-64`) and "Admins always
         * satisfy `has_operator_authority(_, _, Admin)`" (`authorization.ak:21`), so
         * turning this on adds a second way in rather than gating the first. Every
         * word the screen used ("Require", "Required") said the opposite.
         */}
        <Label>{i18n("letSeveralPeopleActTogether")}</Label>
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
           *
           * The free-number box became a slider: it cannot hold 0, a decimal, or an
           * empty string, which retired the "must be an integer" and "enter at least
           * 1" error states, and the fill carries the reachability colour — green
           * while the co-signers can meet the number, red once the threshold passes
           * the power they hold between them.
           */}
          <IntegerPowerSlider
            label={i18n("approvalPowerNeeded")}
            value={value.multiSigThreshold}
            onChange={(multiSigThreshold) =>
              change({ ...value, multiSigThreshold })
            }
            max={Math.max(2, availablePower)}
            tone={
              !hasNeeded
                ? "neutral"
                : needed <= availablePower
                  ? "met"
                  : "unreachable"
            }
            helper={
              !hasNeeded
                ? i18n("enterAtLeast1OrNoActionCan")
                : needed > availablePower
                  ? i18n("nobodyCanReachNeededThePeopleWhoCan", { needed: needed, availablePower: availablePower })
                  : i18n("thisAddsUpApprovalPowerNotPeopleThe", { availablePower: availablePower })}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{i18n("nobodyHoldsACosignerChipYetSo")}</p>
      )}
      <section className="space-y-3">
        {/* The warning above used to be a dead end: the people who would close the gap
            are added on the People page, which nothing here named. Offering the add
            right under the arithmetic keeps the fix one click from the problem. */}
        {enabled ? (
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-foreground">{i18n("cosigners")}</h3>
            <p className="text-xs text-muted-foreground">{i18n("cosignersHelper")}</p>
          </div>
        ) : null}
        {coSigners.map((person) => (
          <div
            key={person.id}
            className="user-surface space-y-3 rounded-md border border-border/60 bg-background/20 p-3"
          >
            <PersonHeading person={person}>{personLabel(i18n("cosigner"), person)}</PersonHeading>
            <div className="grid gap-3 md:grid-cols-2">
              <IntegerPowerSlider
                label={i18n("approvalPower")}
                value={person.multiSigPower}
                onChange={(multiSigPower) =>
                  change({
                    ...value,
                    users: value.users.map((other) =>
                      other.id === person.id
                        ? { ...other, multiSigPower }
                        : other
                    )
                  })
                }
                max={5}
              />
            </div>
            <WalletHashesEditor
              label={i18n("walletsThisPersonSignsWith")}
              knownAddresses={buildKnownAddresses(activePaymentKeyHash, activeAddress)}
              value={person.wallets}
              onChange={(wallets) =>
                change({
                  ...value,
                  users: value.users.map((other) =>
                    other.id === person.id ? { ...other, wallets } : other
                  )
                })
              }
              addLabel={i18n("addAWallet")}
              placeholder={i18n("cardanoWalletId")}
            />
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => change(withCoSignerAdded(value))}
          >
            {i18n("addACosigner")}
          </Button>
        </div>
      </section>
    </div>
  );
}
