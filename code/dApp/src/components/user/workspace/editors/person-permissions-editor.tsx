"use client";
import { useTranslations } from "next-intl";

import { useAtomValue } from "jotai";
import { useId } from "react";

import { buildKnownAddresses, StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";
import { GuidedDateTimeField } from "./guided-fields";
import { IntegerPowerSlider } from "./integer-power-slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import {
  approvalPowerForUser,
  formatCountLabel,
  withUserAdminEnabled
} from "@/components/user/workspace/helpers";
import { PersonHeading } from "@/components/user/workspace/editors/person-heading";
import { personLabel } from "@/lib/contracts/person-label";
import { type UserFormState } from "@/lib/contracts/state-form";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// One card per person in the wallet. The Role select and the three per-tab cards
// this replaces each showed one slice of the same question — what may this person
// do? The chips ARE the permissions now: pressing one grants it, pressing again
// takes it away, and the editor for each held permission sits directly underneath.

function PermissionChip({
  label,
  pressed,
  disabled,
  title,
  onClick
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "user-surface user-task-chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color]",
        pressed
          ? "border-primary/45 bg-primary/12 text-foreground"
          : "border-border/70 bg-background/40 text-muted-foreground hover:border-primary/30 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-45"
      )}
    >
      {pressed ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

export function PersonPermissionsEditor({
  user,
  onChange,
  onRemove,
  approvalsNeeded
}: {
  user: UserFormState;
  onChange: (value: UserFormState) => void;
  onRemove: () => void;
  /** The wallet's approval threshold, so the power slider can show where
   * "this person alone reaches the rule" begins on the track. */
  approvalsNeeded?: number;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedPeopleEditor");
  const uid = useId();
  const walletBalance = useAtomValue(walletBalanceSummaryAtom);
  const activePaymentKeyHash = useAtomValue(activePaymentKeyHashAtom);
  const activeAddress = useAtomValue(activeAddressAtom);
  const alreadyLinked =
    activePaymentKeyHash !== null && user.wallets.includes(activePaymentKeyHash);
  const knownAddresses = buildKnownAddresses(activePaymentKeyHash, activeAddress);
  const isCoSigner = user.multiSigPowerMode === "some";
  const isSpender = user.perDayAllowance.length > 0;

  // Chips grant or take one permission at a time and always land on `custom`:
  // the named presets (owner / spender) each describe a whole combination, and a
  // person edited chip by chip is exactly the combination the old Role select
  // could not name. Nothing downstream reads `preset` — it is re-inferred from
  // the on-chain state on the next load.
  const patch = (next: Partial<UserFormState>) =>
    onChange({ ...user, ...next, preset: "custom" });

  const toggleOwner = () =>
    // `withUserAdminEnabled` keeps the rest of the person intact and switches on
    // the check-in right an owner always holds. The old admin preset wiped the
    // co-signer power and limits a person may already have, which a toggle must
    // not do.
    onChange({ ...withUserAdminEnabled(user, !user.isAdmin), preset: "custom" });

  const toggleCoSigner = () =>
    patch(
      isCoSigner
        ? { multiSigPowerMode: "none" }
        : // A granted co-signer chip with an empty power would count for nothing
          // (`approvalPowerForUser` reads 0 for blank), so grant one power.
          { multiSigPowerMode: "some", multiSigPower: user.multiSigPower.trim() || "1" }
    );

  const toggleSpender = () =>
    isSpender
      ? patch({ perDayAllowance: [], remainingAllowance: [] })
      : patch({
          perDayAllowance:
            user.perDayAllowance.length > 0
              ? user.perDayAllowance
              : [{ policyId: "", assetName: "", amount: "" }]
        });

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PersonHeading person={user}>{personLabel("Person", user)}</PersonHeading>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("remove")}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="eyebrow text-muted-foreground">{i18n("permissions")}</p>
        <div className="flex flex-wrap gap-2">
          <PermissionChip
            label={i18n("owner")}
            pressed={user.isAdmin}
            onClick={toggleOwner}
            title={i18n("anOwnerCanChangeEveryWalletSettingAnd")}
          />
          <PermissionChip
            label={i18n("cosigner")}
            pressed={isCoSigner}
            onClick={toggleCoSigner}
            title={i18n("countsTowardApprovals")}
          />
          <PermissionChip
            label={i18n("spender")}
            pressed={isSpender}
            disabled={user.isAdmin}
            onClick={toggleSpender}
            title={
              user.isAdmin
                ? i18n("ownerNoDailyLimit")
                : i18n("howMuchThisPersonCanSpendEachDay")
            }
          />
          <PermissionChip
            label={i18n("checkIn")}
            pressed={user.canRenewProofOfLife}
            disabled={user.isAdmin}
            onClick={() => patch({ canRenewProofOfLife: !user.canRenewProofOfLife })}
            title={i18n("canCheckInToRefreshTheProofOf")}
          />
        </div>
        {user.isAdmin ? (
          <p className="text-xs text-muted-foreground">{i18n("everyOwnerCanCheckIn")}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {formatCountLabel(user.wallets.length, "linked wallet")}
          </Badge>
          {isCoSigner && approvalPowerForUser(user) > 0 ? (
            <Badge variant="secondary">
              {i18n("approvalPowerApprovalpower", { approvalPower: approvalPowerForUser(user) })}
            </Badge>
          ) : null}
        </div>
      </div>

      {isCoSigner ? (
        <IntegerPowerSlider
          label={i18n("approvalPower")}
          value={user.multiSigPower}
          onChange={(multiSigPower) => patch({ multiSigPower })}
          max={5}
          markAt={approvalsNeeded}
          helper={i18n("addedUpWithEveryoneElseWhoApprovesZero")}
        />
      ) : null}

      {isSpender && !user.isAdmin ? (
        <div className="space-y-3">
          <StateAssetAmountListEditor
            label={i18n("dailyLimit")}
            helper={i18n("howMuchThisPersonCanSpendEachDay")}
            value={user.perDayAllowance}
            onChange={(perDayAllowance) => patch({ perDayAllowance })}
            availableAssets={walletBalance.assets}
          />
          <StateAssetAmountListEditor
            label={i18n("leftToSpend")}
            helper={i18n("whatIsLeftOfTheDailyLimitRight")}
            value={user.remainingAllowance}
            onChange={(remainingAllowance) => patch({ remainingAllowance })}
            availableAssets={walletBalance.assets}
          />
          <GuidedDateTimeField
            idPrefix={`${uid}-next-allowance-reset`}
            label={i18n("limitResetsAfter")}
            value={user.nextAllowanceReset}
            onChange={(nextAllowanceReset) => patch({ nextAllowanceReset })}
            helper={i18n("theFirstPaymentMadeAfterThisTimeGets")}
          />
        </div>
      ) : null}

      <WalletHashesEditor
        label={i18n("walletsThisPersonSignsWith")}
        helper={i18n("thisPersonCanOnlyUseTheSmartWallet")}
        value={user.wallets}
        onChange={(wallets) => patch({ wallets })}
        addLabel={i18n("addAWallet")}
        emptyLabel={i18n("noWalletAddedYetSoThisPersonCannot")}
        placeholder={i18n("cardanoWalletId")}
        knownAddresses={knownAddresses}
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
              : patch({ wallets: [...user.wallets, activePaymentKeyHash] })
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
