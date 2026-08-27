"use client";
import { useTranslations } from "next-intl";


import { StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";
import { GuidedDateTimeField } from "./guided-fields";
import { DisclosureSection } from "./primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LONG_DESCRIPTION_LIMIT } from "@/components/user/workspace/constants";
import { defaultSafetyUnlockTimestamp } from "@/components/user/workspace/helpers";
import { type BeneficiaryFormState, type UserFormState } from "@/lib/contracts/state-form";
import { DEFAULT_WALLET_NAME, MAX_WALLET_NAME_BYTES, clampWalletNameInput, normalizeWalletName, walletNameByteLength } from "@/lib/contracts/state-wallet-name";
import { cn } from "@/lib/utils/cn";
import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

export function WalletRuleSummaryTile({
  icon: Icon,
  label,
  value,
  description,
  tone = "default"
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  description: string;
  tone?: "default" | "good" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tone === "good"
          ? "border-emerald-500/30 bg-emerald-500/10"
          : tone === "warn"
            ? "border-amber-500/35 bg-amber-500/10"
            : "border-border/60 bg-muted/20"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function WalletRuleSection({
  icon: Icon,
  title,
  description,
  action,
  children
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletSettingsEditors");
  const descriptionIsLong = description.length > LONG_DESCRIPTION_LIMIT;

  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-background/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/30 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              {descriptionIsLong ? (
                <InfoHint label={i18n("moreAboutTitle", { title: title })} contentClassName="max-w-sm">
                  {description}
                </InfoHint>
              ) : null}
            </div>
            {!descriptionIsLong ? (
              <p className="text-xs leading-snug text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function WalletRuleTogglePanel({
  title,
  description,
  checked,
  onCheckedChange,
  enabledLabel,
  disabledLabel,
  children
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  enabledLabel: string;
  disabledLabel: string;
  children?: ReactNode;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletSettingsEditors");
  const descriptionIsLong = description.length > LONG_DESCRIPTION_LIMIT;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        checked ? "border-primary/35 bg-primary/10" : "border-border/60 bg-muted/20"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{title}</p>
            {descriptionIsLong ? (
              <InfoHint label={i18n("moreAboutTitle", { title: title })} contentClassName="max-w-sm">
                {description}
              </InfoHint>
            ) : null}
          </div>
          {!descriptionIsLong ? (
            <p className="text-xs leading-snug text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant={checked ? "secondary" : "outline"}
          onClick={() => onCheckedChange(!checked)}
        >
          {checked ? enabledLabel : disabledLabel}
        </Button>
      </div>
      {checked && children ? <div className="mt-4 space-y-4">{children}</div> : null}
    </div>
  );
}

export function OwnerAccessEditor({
  user,
  displayIndex,
  connectedPaymentKeyHash,
  onChange,
  onRemove
}: {
  user: UserFormState;
  displayIndex: number;
  connectedPaymentKeyHash?: string | null;
  onChange: (value: UserFormState) => void;
  onRemove: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletSettingsEditors");
  const countI18n = useTranslations("Counts");
  const normalizedConnectedHash = connectedPaymentKeyHash?.trim() ?? "";
  const connectedWalletAdded =
    normalizedConnectedHash.length > 0 && user.wallets.includes(normalizedConnectedHash);

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{i18n("owner")} {displayIndex}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{i18n("canManageWallet")}</Badge>
            <Badge variant="outline">{countI18n("walletId", { count: user.wallets.length })}</Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("removeOwner")}
        </Button>
      </div>
      <WalletHashesEditor
        label={i18n("ownerWalletIds")}
        helper={i18n("addTheWalletIdsThatShouldBeAble")}
        value={user.wallets}
        onChange={(wallets) => onChange({ ...user, wallets })}
        addLabel={i18n("addOwnerWallet")}
      />
      {normalizedConnectedHash && !connectedWalletAdded ? (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange({
              ...user,
              wallets: [...user.wallets, normalizedConnectedHash]
            })
          }
        >
          {i18n("useConnectedWalletHere")}
        </Button>
      ) : null}
    </div>
  );
}

export function SpendingAccessEditor({
  user,
  displayIndex,
  onChange,
  onRemove
}: {
  user: UserFormState;
  displayIndex: number;
  onChange: (value: UserFormState) => void;
  onRemove: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletSettingsEditors");
  const countI18n = useTranslations("Counts");
  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{i18n("spendingPerson")} {displayIndex}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{countI18n("walletId", { count: user.wallets.length })}</Badge>
            <Badge variant="outline">{countI18n("limit", { count: user.perDayAllowance.length })}</Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("removePerson")}
        </Button>
      </div>
      <WalletHashesEditor
        label={i18n("walletIdsAllowedToSpend")}
        value={user.wallets}
        onChange={(wallets) => onChange({ ...user, wallets })}
        addLabel={i18n("addWalletId")}
      />
      <StateAssetAmountListEditor
        label={i18n("dailySpendingLimit")}
        helper={i18n("setAnAdaAmountOrAddAPolicy")}
        value={user.perDayAllowance}
        onChange={(perDayAllowance) => onChange({ ...user, perDayAllowance })}
        addLabel={i18n("addDailyLimit")}
      />
      <DisclosureSection
        title={i18n("allowanceDetails")}
        description={i18n("theseFieldsAreMainlyForEditingAnExisting")}
      >
        <GuidedDateTimeField
          idPrefix={`spending-person-${displayIndex}-next-allowance-reset`}
          label={i18n("limitResetsOn")}
          value={user.nextAllowanceReset}
          onChange={(nextAllowanceReset) => onChange({ ...user, nextAllowanceReset })}
          helper={i18n("chooseWhenThisPersonSDailyLimitShould")}
        />
        <StateAssetAmountListEditor
          label={i18n("availableBeforeReset")}
          value={user.remainingAllowance}
          onChange={(remainingAllowance) => onChange({ ...user, remainingAllowance })}
          addLabel={i18n("addRemainingAmount")}
        />
      </DisclosureSection>
    </div>
  );
}

export function RecoveryAccessEditor({
  beneficiary,
  displayIndex,
  totalWeight,
  onChange,
  onRemove
}: {
  beneficiary: BeneficiaryFormState;
  displayIndex: number;
  totalWeight: number;
  onChange: (value: BeneficiaryFormState) => void;
  onRemove: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletSettingsEditors");
  const countI18n = useTranslations("Counts");
  const hasPersonalWait = beneficiary.unlockAfterMode === "some";
  const ownWeight = Number.parseInt(beneficiary.weight, 10);
  const sharePercent =
    Number.isFinite(ownWeight) && ownWeight > 0 && totalWeight > 0
      ? ((ownWeight / totalWeight) * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{i18n("recoveryContact")} {displayIndex}</p>
          <Badge variant="outline">{countI18n("signerId", { count: beneficiary.wallets.length })}</Badge>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("removeRecoveryContact")}
        </Button>
      </div>
      <WalletHashesEditor
        label={i18n("recoveryContactSignerIds")}
        helper={i18n("addSignerIdsAllowedToMakeThisContact")}
        value={beneficiary.wallets}
        onChange={(wallets) => onChange({ ...beneficiary, wallets })}
        addLabel={i18n("addSignerId")}
      />
      <WalletRuleTogglePanel
        title={i18n("useAPersonalWaitDate")}
        description={i18n("theSharedWakeUpTimerAppliesToEveryone")}
        checked={hasPersonalWait}
        onCheckedChange={(checked) =>
          onChange({
            ...beneficiary,
            unlockAfterMode: checked ? "some" : "none",
            unlockAfter:
              checked && !beneficiary.unlockAfter.trim()
                ? defaultSafetyUnlockTimestamp()
                : beneficiary.unlockAfter
          })
        }
        enabledLabel={i18n("usingDate")}
        disabledLabel={i18n("noDate")}
      >
        <GuidedDateTimeField
          idPrefix={`recovery-person-${displayIndex}-unlock-after`}
          label={i18n("recoveryCanStartAfter")}
          value={beneficiary.unlockAfter}
          onChange={(unlockAfter) => onChange({ ...beneficiary, unlockAfter })}
          helper={i18n("chooseTheEarliestLocalDateAndTimeThis")}
        />
      </WalletRuleTogglePanel>
      <div className="space-y-1.5">
        <Label>{i18n("recoveryShareWeight")}</Label>
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
            ? i18n("thisContactCanWithdrawAboutSharepercentOfEach", { sharePercent: sharePercent, ownWeight: ownWeight, totalWeight: totalWeight })
            : i18n("higherWeightMeansALargerOneTimeShare")}
        </p>
      </div>
    </div>
  );
}

export function WalletNameEditor({
  value,
  onChange,
  compact = false,
  editable = true
}: {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  editable?: boolean;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletSettingsEditors");
  const normalizedValue = value.trim();
  const byteCount = walletNameByteLength(normalizedValue);
  const charCount = Array.from(normalizedValue).length;
  const overByteLimit = byteCount > MAX_WALLET_NAME_BYTES;
  const displayName = normalizedValue ? normalizeWalletName(value) : "";

  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-background/35",
        compact ? "p-3" : "p-4"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="wallet-name">{i18n("walletName")}</Label>
          <InfoHint label={i18n("moreAboutWalletNames")} contentClassName="max-w-sm">
            {i18n("theNameIsStoredWithTheWalletAnd")}
          </InfoHint>
        </div>
        <span
          className={cn(
            "text-xs",
            overByteLimit ? "text-amber-300" : "text-muted-foreground"
          )}
          title={
            overByteLimit
              ? i18n("nameTooLongForStorageBytecountBytesTry", { byteCount: byteCount })
              : undefined
          }
        >
          {charCount}/{MAX_WALLET_NAME_BYTES} {i18n("characters")}
        </span>
      </div>
      <Input
        id="wallet-name"
        className="mt-2"
        value={value}
        placeholder={DEFAULT_WALLET_NAME}
        disabled={!editable}
        onChange={(event) => onChange(clampWalletNameInput(event.target.value))}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {editable ? (
          displayName ? (
            <>
              {i18n("thisWalletWillShowAs")}{" "}
              <span className="font-medium text-foreground">{displayName}</span>.
            </>
          ) : (
            i18n("addAShortName")
          )
        ) : (
          i18n("renameWithOwnerPath")
        )}
      </p>
    </div>
  );
}
