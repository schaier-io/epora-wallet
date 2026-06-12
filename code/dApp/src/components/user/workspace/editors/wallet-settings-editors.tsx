"use client";

import { StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";
import { GuidedDateTimeField } from "./guided-fields";
import { DisclosureSection } from "./primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LONG_DESCRIPTION_LIMIT } from "@/components/user/workspace/constants";
import { defaultSafetyUnlockTimestamp, formatCountLabel } from "@/components/user/workspace/helpers";
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
                <InfoHint label={`More about ${title}`} contentClassName="max-w-sm">
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
  enabledLabel = "Using",
  disabledLabel = "Not used",
  children
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  enabledLabel?: string;
  disabledLabel?: string;
  children?: ReactNode;
}) {
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
              <InfoHint label={`More about ${title}`} contentClassName="max-w-sm">
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
  const normalizedConnectedHash = connectedPaymentKeyHash?.trim() ?? "";
  const connectedWalletAdded =
    normalizedConnectedHash.length > 0 && user.wallets.includes(normalizedConnectedHash);

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">Owner {displayIndex}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Can manage wallet</Badge>
            <Badge variant="outline">{formatCountLabel(user.wallets.length, "wallet ID")}</Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove owner
        </Button>
      </div>
      <WalletHashesEditor
        label="Owner wallet IDs"
        helper="Add the wallet IDs that should be able to manage this smart wallet."
        value={user.wallets}
        onChange={(wallets) => onChange({ ...user, wallets })}
        addLabel="Add owner wallet"
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
          Use connected wallet here
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
  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">Spending person {displayIndex}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{formatCountLabel(user.wallets.length, "wallet ID")}</Badge>
            <Badge variant="outline">{formatCountLabel(user.perDayAllowance.length, "limit")}</Badge>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove person
        </Button>
      </div>
      <WalletHashesEditor
        label="Wallet IDs allowed to spend"
        value={user.wallets}
        onChange={(wallets) => onChange({ ...user, wallets })}
        addLabel="Add wallet ID"
      />
      <StateAssetAmountListEditor
        label="Daily spending limit"
        helper="Use lovelace for ADA, or add a policy ID and asset name for native assets."
        value={user.perDayAllowance}
        onChange={(perDayAllowance) => onChange({ ...user, perDayAllowance })}
        addLabel="Add daily limit"
      />
      <DisclosureSection
        title="Allowance details"
        description="These fields are mainly for editing an existing wallet mid-period. They decide when this person's allowance resets and how much remains before that reset."
      >
        <GuidedDateTimeField
          idPrefix={`spending-person-${displayIndex}-next-allowance-reset`}
          label="Limit resets on"
          value={user.nextAllowanceReset}
          onChange={(nextAllowanceReset) => onChange({ ...user, nextAllowanceReset })}
          helper="Choose when this person's daily limit should start fresh again."
        />
        <StateAssetAmountListEditor
          label="Available before reset"
          value={user.remainingAllowance}
          onChange={(remainingAllowance) => onChange({ ...user, remainingAllowance })}
          addLabel="Add remaining amount"
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
          <p className="font-medium text-foreground">Recovery contact {displayIndex}</p>
          <Badge variant="outline">{formatCountLabel(beneficiary.wallets.length, "wallet ID")}</Badge>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove recovery contact
        </Button>
      </div>
      <WalletHashesEditor
        label="Recovery wallet IDs"
        helper="Add the wallet IDs that may help recover funds after the safety timer allows it."
        value={beneficiary.wallets}
        onChange={(wallets) => onChange({ ...beneficiary, wallets })}
        addLabel="Add recovery wallet"
      />
      <WalletRuleTogglePanel
        title="Use a personal wait date"
        description="Most wallets can rely on the shared safety timer. Add a personal wait date only when this recovery contact should be blocked until a later date."
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
        enabledLabel="Using date"
        disabledLabel="No date"
      >
        <GuidedDateTimeField
          idPrefix={`recovery-person-${displayIndex}-unlock-after`}
          label="Recovery can start after"
          value={beneficiary.unlockAfter}
          onChange={(unlockAfter) => onChange({ ...beneficiary, unlockAfter })}
          helper="Choose the earliest local date and time this person may use recovery."
        />
      </WalletRuleTogglePanel>
      <div className="space-y-1.5">
        <Label>Recovery share weight</Label>
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
            ? `This person can recover about ${sharePercent}% of the remaining funds in a single, one-time withdrawal (weight ${ownWeight} of ${totalWeight}). After they withdraw, their share is removed and the rest re-splits among the others.`
            : "Higher weight means a larger one-time share of the recoverable funds, split proportionally across all recovery contacts. Whole number, 1 or more."}
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
          <Label htmlFor="wallet-name">Wallet name</Label>
          <InfoHint label="More about wallet names" contentClassName="max-w-sm">
            The name is stored with the wallet and only an owner can rename it later. Keep it short
            so it&apos;s easy to recognize.
          </InfoHint>
        </div>
        <span
          className={cn(
            "text-xs",
            overByteLimit ? "text-amber-300" : "text-muted-foreground"
          )}
          title={
            overByteLimit
              ? `Name too long for storage (${byteCount} bytes). Try removing accented characters or emoji.`
              : undefined
          }
        >
          {charCount}/{MAX_WALLET_NAME_BYTES} characters
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
              This wallet will show as{" "}
              <span className="font-medium text-foreground">{displayName}</span>.
            </>
          ) : (
            "Add a short name so this wallet is easy to recognize later."
          )
        ) : (
          "Rename this wallet with the owner update path."
        )}
      </p>
    </div>
  );
}
