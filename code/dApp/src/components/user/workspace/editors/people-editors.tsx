"use client";
import { useTranslations } from "next-intl";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { useAtomValue } from "jotai";


import { useId, useState } from "react";

import { buildKnownAddresses, WalletHashesEditor } from "./asset-editors";
import { ApprovalPowerSlider } from "./approval-power-slider";
import { GuidedDateTimeField } from "./guided-fields";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineFieldError } from "./primitives";
import { describeAddressProblem, looksLikeCardanoAddress, paymentKeyHashFromAddress } from "@/lib/contracts/payout-address";
import {
  parseApprovalPowerInput,
  personApprovalPowerCeiling,
  raisedThresholdMaximum,
  reachableApprovalPower,
  thresholdSliderCeiling,
  withBeneficiaryPayoutAndSigningAddress,
  withCoSignerAdded,
  withMultisigDerivedFromCoSigners
} from "@/components/user/workspace/helpers/form-state";
import { MAX_ON_CHAIN_STATE_INTEGER } from "@/lib/contracts/on-chain-integer";
import { PersonHeading } from "@/components/user/workspace/editors/person-heading";
import { personLabel } from "@/lib/contracts/person-label";
import { type BeneficiaryFormState, type StateFormState } from "@/lib/contracts/state-form";
import {
  MAX_ACCESS_RECORDS,
  MAX_TOTAL_USER_WALLETS,
  MAX_USERS,
  MAX_WALLETS_PER_USER
} from "@/lib/contracts/state-validation";
import { countWalletEntries } from "@/lib/contracts/wallet-capacity";

export function BeneficiaryPayoutAddressEditor({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPeopleEditors");
  const uid = useId();
  const payoutAddressError = looksLikeCardanoAddress(value)
    ? describeAddressProblem(value) ??
      (paymentKeyHashFromAddress(value) ? null : i18n("payoutAddressNeedsPaymentKey"))
    : null;

  return (
    <div className="space-y-1">
      <Label htmlFor={`${uid}-payout-address`}>{i18n("payoutAndSigningWallet")}</Label>
      <Input
        id={`${uid}-payout-address`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={i18n("payoutAddressPlaceholder")}
        aria-invalid={payoutAddressError ? true : undefined}
        aria-describedby={`${uid}-payout-address-help${payoutAddressError ? ` ${uid}-payout-address-error` : ""}`}
      />
      <InlineFieldError id={`${uid}-payout-address-error`} message={payoutAddressError} />
      <p id={`${uid}-payout-address-help`} className="text-xs text-muted-foreground">
        {i18n("payoutAndSigningWalletHelp")}
      </p>
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
        <PersonHeading person={beneficiary}>{personLabel(i18n("recoveryContact"), beneficiary)}</PersonHeading>
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
              reserve)`. An earlier contact is then removed. The final contact stays in
              State so it can recover other fund pools and funds sent later. */}
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
      <BeneficiaryPayoutAddressEditor
        value={beneficiary.payoutAddress}
        onChange={(payoutAddress) =>
          onChange(withBeneficiaryPayoutAndSigningAddress(beneficiary, payoutAddress))
        }
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
  onChange,
  variant = "full"
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
  /** compact = the rule and its threshold only, for the top of the People tab where
   * the Co-signer chips live; full = with the per-co-signer list (Wallet settings). */
  variant?: "full" | "compact";
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPeopleEditors");
  const uid = useId();
  const activePaymentKeyHash = useAtomValue(activePaymentKeyHashAtom);
  const activeAddress = useAtomValue(activeAddressAtom);
  // The rule has no on/off control of its own any more: it is whoever holds a
  // Co-signer chip. The chips live on the People page, but this editor still offers
  // "Add a co-signer" so turning the rule on never requires a detour.
  const change = (next: StateFormState) =>
    onChange(withMultisigDerivedFromCoSigners(next));
  // The custom slider maximum is a range preference, not wallet configuration:
  // the chain holds no such field, so it lives in this editor and resets to the
  // derived ceiling ("Auto") on a fresh mount. The threshold itself is form
  // state, and the slider re-widens around it from the value it is handed.
  const [customMaximum, setCustomMaximum] = useState("");
  const availablePower = reachableApprovalPower(value.users);
  const needed = Number.parseInt(value.multiSigThreshold, 10);
  const hasNeeded = Number.isFinite(needed) && needed > 0;
  // The exact entry takes whatever is typed, so the trust boundary is here: a
  // non-blank value that is not a whole on-chain number shows its own error,
  // and blank keeps the long-standing "enter at least 1" line under the slider.
  const thresholdPower = parseApprovalPowerInput(value.multiSigThreshold);
  const thresholdParseError =
    value.multiSigThreshold.trim() && thresholdPower === null
      ? i18n("enterAWholeNumberBetween1AndMax", {
          max: MAX_ON_CHAIN_STATE_INTEGER.toString()
        })
      : null;
  const maximumPower = parseApprovalPowerInput(customMaximum);
  const maximumParseError =
    customMaximum.trim() && (maximumPower === null || maximumPower < 1n)
      ? i18n("enterAWholeNumberOf1OrMoreOrLeave")
      : null;
  // The people the threshold counts: the contract sums `multi_sig_power` over the
  // users who opted in (`configuration.ak:272-296`), so these are the co-signers.
  const coSigners = value.users.filter((user) => user.multiSigPowerMode === "some");
  const enabled = coSigners.length > 0;
  const peopleAtCap =
    value.users.length >= MAX_USERS ||
    value.users.length + value.beneficiaries.length >= MAX_ACCESS_RECORDS;
  const canAddUserWalletEntry =
    countWalletEntries(value.users) < MAX_TOTAL_USER_WALLETS;
  const addCoSigner = () => {
    if (!peopleAtCap) {
      change(withCoSignerAdded(value));
    }
  };

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
           * The slider keeps the shape of the number (it cannot hold 0 or a
           * decimal), and the exact box beside it carries the value itself: a
           * total above the power the wallet can reach is legitimate on-chain
           * (`configuration.ak:16-24` keeps owners able to act) but lies past the
           * derived slider limit, so typing it is the only honest way to set it.
           * "Slider maximum" raises the range itself, without a code change, and
           * the fill carries the reachability colour — green while the
           * co-signers can meet the number, red once the threshold passes the
           * power they hold between them.
           */}
          <Label id={`${uid}-required-approvals-label`}>{i18n("approvalPowerNeeded")}</Label>
          <ApprovalPowerSlider
            id={`${uid}-required-approvals`}
            labelledBy={`${uid}-required-approvals-label`}
            value={value.multiSigThreshold}
            onChange={(multiSigThreshold) =>
              change({ ...value, multiSigThreshold })
            }
            min={1}
            max={thresholdSliderCeiling(value, customMaximum)}
            fullAt={availablePower}
            fullAtHint={i18n("everyCosignerHasToApprove")}
            invalid={!hasNeeded || needed > availablePower}
            describedBy={`${uid}-required-approvals-help`}
          />
          <p id={`${uid}-required-approvals-help`} className="text-xs text-muted-foreground">
            {!hasNeeded
              ? i18n("enterAtLeast1OrNoActionCan")
              : needed > availablePower
                ? i18n("nobodyCanReachNeededThePeopleWhoCan", { needed: needed, availablePower: availablePower })
                : i18n("thisAddsUpApprovalPowerNotPeopleThe", { availablePower: availablePower })}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <Label
                htmlFor={`${uid}-threshold-exact`}
                className="whitespace-nowrap text-xs text-muted-foreground"
              >
                {i18n("exactValue")}
              </Label>
              <Input
                id={`${uid}-threshold-exact`}
                inputMode="numeric"
                autoComplete="off"
                className="w-28 tabular-nums"
                value={value.multiSigThreshold}
                onChange={(event) => {
                  const multiSigThreshold = event.target.value;
                  // Typing a larger total lifts the custom maximum with it, so
                  // the slider can reach the number; only this box lowers the
                  // range. The ratchet lives in the helper so a slider drag can
                  // never shrink it.
                  setCustomMaximum((previous) =>
                    raisedThresholdMaximum(previous, multiSigThreshold)
                  );
                  change({ ...value, multiSigThreshold });
                }}
                aria-invalid={thresholdParseError ? true : undefined}
                aria-describedby={
                  thresholdParseError ? `${uid}-threshold-exact-error` : undefined
                }
              />
              <InlineFieldError
                id={`${uid}-threshold-exact-error`}
                message={thresholdParseError}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label
                htmlFor={`${uid}-slider-maximum`}
                className="whitespace-nowrap text-xs text-muted-foreground"
              >
                {i18n("sliderMaximum")}
              </Label>
              <Input
                id={`${uid}-slider-maximum`}
                inputMode="numeric"
                autoComplete="off"
                className="w-24 tabular-nums"
                placeholder={i18n("sliderMaximumAuto")}
                value={customMaximum}
                onChange={(event) => setCustomMaximum(event.target.value)}
                aria-invalid={maximumParseError ? true : undefined}
                aria-describedby={
                  maximumParseError ? `${uid}-slider-maximum-error` : undefined
                }
              />
              <InlineFieldError
                id={`${uid}-slider-maximum-error`}
                message={maximumParseError}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {i18n("sliderMaximumHelpsYouPickAThreshold")}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{i18n("nobodyHoldsACosignerChipYetSo")}</p>
      )}
      {/* Compact lives at the top of the People tab, right above the cards that hold
          the chips this rule derives from — repeating the co-signer list there would
          render the same people twice on one page. */}
      {variant === "full" ? (
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
            <div className="space-y-1">
              <Label id={`${uid}-cosigner-power-${person.id}-label`}>{i18n("approvalPower")}</Label>
              <ApprovalPowerSlider
                id={`${uid}-cosigner-power-${person.id}`}
                labelledBy={`${uid}-cosigner-power-${person.id}-label`}
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
                min={1}
                max={personApprovalPowerCeiling(value)}
                fullAt={hasNeeded ? needed : undefined}
                fullAtHint={i18n("thisPersonMeetsTheThresholdAlone")}
                className="max-w-xl"
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
              canAdd={
                canAddUserWalletEntry &&
                person.wallets.length < MAX_WALLETS_PER_USER
              }
            />
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={addCoSigner}
            disabled={peopleAtCap}
          >
            {i18n("addACosigner")}
          </Button>
        </div>
        </section>
      ) : null}
    </div>
  );
}
