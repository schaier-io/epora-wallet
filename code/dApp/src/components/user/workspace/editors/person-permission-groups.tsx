"use client";
import { useAtomValue } from "jotai";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, HandHeart, KeyRound, Waypoints, Wallet, type LucideIcon } from "lucide-react";

import { ApprovalPowerBar } from "./approval-power-bar";
import { buildKnownAddresses, StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";
import { GuidedDateTimeField } from "./guided-fields";
import { BeneficiaryPayoutAddressEditor } from "./people-editors";
import { PowerStepper } from "./power-stepper";
import { SignerInvite } from "./signer-invite";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import {
  approvalPowerForUser,
  withBeneficiaryPayoutAndSigningAddress
} from "@/components/user/workspace/helpers/form-state";
import {
  approvalThreshold,
  coSignerSegments,
  personTag
} from "@/components/user/workspace/helpers/people-model";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import {
  MAX_TOTAL_USER_WALLETS,
  MAX_WALLETS_PER_USER
} from "@/lib/contracts/state-validation";
import {
  type BeneficiaryFormState,
  type StateFormState,
  type UserFormState
} from "@/lib/contracts/state-form";

/**
 * One permission's settings, folded to a line until opened. The summary on the right
 * says the current value, so a closed group still answers "how much?".
 */
export function PermissionGroup({
  icon: Icon,
  title,
  summary,
  defaultOpen = false,
  children
}: {
  icon: LucideIcon;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group rounded-md border border-border/60 bg-background/30"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 font-medium text-foreground">{title}</span>
        {summary ? <span className="text-xs text-muted-foreground tabular-nums">{summary}</span> : null}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-4 px-3 pb-4 pt-1">{children}</div>
    </details>
  );
}

export function CoSignerGroup({
  value,
  user,
  onChange
}: {
  value: StateFormState;
  user: UserFormState;
  onChange: (user: UserFormState) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPersonRow");
  const uid = useId();
  const own = approvalPowerForUser(user);
  const threshold = approvalThreshold(value);
  const tag = personTag(user);
  const hint =
    threshold === null
      ? i18n("addedUpWithEveryoneElseWhoApproves")
      : own >= threshold
        ? i18n("canActAlone", { name: tag })
        : i18n("needsMoreFromOthers", { name: tag, missing: threshold - own });

  return (
    <PermissionGroup
      icon={Waypoints}
      title={i18n("approvalPower")}
      summary={threshold === null ? String(own) : i18n("powerOfNeeded", { power: own, needed: threshold })}
      defaultOpen
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span id={`${uid}-label`} className="sr-only">{i18n("approvalPower")}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
        <PowerStepper
          id={`${uid}-power`}
          labelledBy={`${uid}-label`}
          value={user.multiSigPower}
          onChange={(multiSigPower) => onChange({ ...user, multiSigPower })}
        />
      </div>
      <ApprovalPowerBar
        threshold={threshold}
        segments={coSignerSegments(value).map((segment) => ({
          key: segment.userId,
          label: personTag(value.users[segment.userIndex]),
          power: segment.power,
          highlighted: segment.userId === user.id
        }))}
      />
      {/* Granting the permission writes this person into the wallet. It does not reach
          them: they still sign in once before they can co-sign anything. */}
      <SignerInvite walletHashes={user.wallets} />
    </PermissionGroup>
  );
}

export function SpenderGroup({
  user,
  onChange,
  canAddPerDayAllowanceEntry,
  canAddRemainingAllowanceEntry
}: {
  user: UserFormState;
  onChange: (user: UserFormState) => void;
  canAddPerDayAllowanceEntry: boolean;
  canAddRemainingAllowanceEntry: boolean;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPersonRow");
  const people = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
  const uid = useId();
  const walletBalance = useAtomValue(walletBalanceSummaryAtom);
  const patch = (next: Partial<UserFormState>) => onChange({ ...user, ...next, preset: "custom" });

  return (
    <PermissionGroup
      icon={Wallet}
      title={people("dailyLimit")}
      summary={i18n("tokenCount", { count: user.perDayAllowance.length })}
      defaultOpen
    >
      <StateAssetAmountListEditor
        label={people("dailyLimit")}
        helper={people("howMuchThisPersonCanSpendEachDay")}
        value={user.perDayAllowance}
        onChange={(perDayAllowance) => patch({ perDayAllowance })}
        canAdd={canAddPerDayAllowanceEntry}
        availableAssets={walletBalance.assets}
      />
      {/* What is left today and when it refills are rarely edited by hand: the
          contract moves both on every payment. They stay one click away. */}
      <PermissionGroup icon={Wallet} title={i18n("leftToSpendAndReset")}>
        <StateAssetAmountListEditor
          label={people("leftToSpend")}
          helper={people("whatIsLeftOfTheDailyLimitRight")}
          value={user.remainingAllowance}
          onChange={(remainingAllowance) => patch({ remainingAllowance })}
          canAdd={canAddRemainingAllowanceEntry}
          availableAssets={walletBalance.assets}
        />
        <GuidedDateTimeField
          idPrefix={`${uid}-next-allowance-reset`}
          label={people("limitResetsAfter")}
          value={user.nextAllowanceReset}
          onChange={(nextAllowanceReset) => patch({ nextAllowanceReset })}
          helper={people("theFirstPaymentMadeAfterThisTimeGets")}
        />
      </PermissionGroup>
    </PermissionGroup>
  );
}

export function RecoveryGroup({
  beneficiary,
  totalWeight,
  linkedWallets,
  onChange
}: {
  beneficiary: BeneficiaryFormState;
  totalWeight: number;
  /** The wallets of the user this contact is joined to, or null for a contact alone. */
  linkedWallets: string[] | null;
  onChange: (beneficiary: BeneficiaryFormState) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPersonRow");
  const contact = useTranslations("ComponentsUserWorkspaceEditorsPeopleEditors");
  const uid = useId();
  const weight = Number.parseInt(beneficiary.weight, 10);
  const percent =
    Number.isFinite(weight) && weight > 0 && totalWeight > 0
      ? Math.round((weight / totalWeight) * 100)
      : null;
  const hasExtraWait = beneficiary.unlockAfterMode === "some";
  // The payout address names the contact's signing key: every load derives one from
  // the other (`withBeneficiarySigningAddressesDerived`). While it is half typed it
  // names nothing, so a contact joined to a user keeps signing with the person's
  // wallet and the row does not split mid-keystroke. A complete address of another
  // wallet is another person, and the row splits the same way a reload would.
  const setPayout = (payoutAddress: string) => {
    const next = withBeneficiaryPayoutAndSigningAddress(beneficiary, payoutAddress);
    onChange(linkedWallets !== null && next.wallets.length === 0 ? { ...next, wallets: beneficiary.wallets } : next);
  };

  return (
    <PermissionGroup
      icon={HandHeart}
      title={contact("recoveryContact")}
      summary={percent === null ? undefined : i18n("sharePercent", { percent })}
      defaultOpen={!beneficiary.payoutAddress}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-weight`}>{contact("share")}</Label>
          <Input
            id={`${uid}-weight`}
            type="number"
            min={1}
            step={1}
            value={beneficiary.weight}
            onChange={(event) => onChange({ ...beneficiary, weight: event.target.value })}
            placeholder="1"
          />
          <p className="text-xs text-muted-foreground">
            {percent === null ? contact("aBiggerNumberTakesABiggerShareSomebody") : i18n("takesAboutPercent", { percent })}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-wait`}>{contact("makeThisPersonWaitLonger")}</Label>
          <Select
            id={`${uid}-wait`}
            value={beneficiary.unlockAfterMode}
            onChange={(event) =>
              onChange({ ...beneficiary, unlockAfterMode: event.target.value as "none" | "some" })
            }
          >
            <option value="none">{contact("no")}</option>
            <option value="some">{contact("yes")}</option>
          </Select>
        </div>
      </div>
      {hasExtraWait ? (
        <GuidedDateTimeField
          idPrefix={`${uid}-unlock-after`}
          label={contact("cannotActBefore")}
          value={beneficiary.unlockAfter}
          onChange={(unlockAfter) => onChange({ ...beneficiary, unlockAfter })}
          helper={contact("evenAfterTheProofOfLifeRunsOut")}
        />
      ) : null}
      <BeneficiaryPayoutAddressEditor value={beneficiary.payoutAddress} onChange={setPayout} />
      {linkedWallets === null ? null : (
        <p className="text-xs text-muted-foreground">{i18n("payoutMustBeAWalletThisPersonSignsWith")}</p>
      )}
    </PermissionGroup>
  );
}

export function WalletsGroup({
  wallets,
  onChange,
  canAddWallet
}: {
  wallets: string[];
  onChange: (wallets: string[]) => void;
  canAddWallet: boolean;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPersonRow");
  const people = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
  const activePaymentKeyHash = useAtomValue(activePaymentKeyHashAtom);
  const activeAddress = useAtomValue(activeAddressAtom);
  const alreadyLinked = activePaymentKeyHash !== null && wallets.includes(activePaymentKeyHash);

  return (
    <PermissionGroup
      icon={KeyRound}
      title={people("walletsThisPersonSignsWith")}
      summary={i18n("walletCount", { count: wallets.length })}
      defaultOpen={wallets.length === 0}
    >
      <WalletHashesEditor
        label={people("walletsThisPersonSignsWith")}
        helper={people("thisPersonCanOnlyUseTheSmartWallet")}
        value={wallets}
        onChange={onChange}
        addLabel={people("addAWallet")}
        emptyLabel={people("noWalletAddedYetSoThisPersonCannot")}
        placeholder={people("cardanoWalletId")}
        knownAddresses={buildKnownAddresses(activePaymentKeyHash, activeAddress)}
        canAdd={canAddWallet}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={activePaymentKeyHash === null || alreadyLinked || !canAddWallet}
          onClick={() =>
            activePaymentKeyHash === null || !canAddWallet
              ? undefined
              : onChange([...wallets, activePaymentKeyHash])
          }
        >
          {people("useTheWalletIAmSignedInWith")}
        </Button>
      </div>
      {!canAddWallet ? (
        <p className="text-xs text-muted-foreground">
          {wallets.length >= MAX_WALLETS_PER_USER
            ? people("thisPersonAlreadyHasMaxWallets", { max: MAX_WALLETS_PER_USER })
            : people("thisWalletAlreadyLinksMaxWallets", { max: MAX_TOTAL_USER_WALLETS })}
        </p>
      ) : null}
    </PermissionGroup>
  );
}
