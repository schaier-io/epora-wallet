"use client";
import { useTranslations } from "next-intl";


import { useAtomValue } from "jotai";


import { walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";
import { GuidedDateTimeField } from "./guided-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LONG_DESCRIPTION_LIMIT } from "@/components/user/workspace/constants";
import { defaultSafetyUnlockTimestamp, formatCountLabel } from "@/components/user/workspace/helpers";
import { personLabel } from "@/lib/contracts/person-label";
import { type BeneficiaryFormState, type UserFormState } from "@/lib/contracts/state-form";
import { DEFAULT_WALLET_NAME, MAX_WALLET_NAME_BYTES, clampWalletNameInput, normalizeWalletName, walletNameByteLength } from "@/lib/contracts/state-wallet-name";
import { cn } from "@/lib/utils/cn";
import { type LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";

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
        "rounded-xl border p-3 sm:p-4",
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
          <p className="eyebrow text-muted-foreground">{label}</p>
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
    <section className="space-y-4 rounded-xl border border-border/60 bg-background/35 p-3 sm:p-4">
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
  enabledLabel?: string;
  disabledLabel?: string;
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
          {checked ? (enabledLabel ?? i18n("using")) : (disabledLabel ?? i18n("notUsed"))}
        </Button>
      </div>
      {checked && children ? <div className="mt-4 space-y-4">{children}</div> : null}
    </div>
  );
}

/**
 * The one wallet id this app can name with an address on its own: the connected wallet's.
 * Keyed lower-case because stored hashes may vary in case.
 */
function buildKnownAddresses(
  connectedPaymentKeyHash: string,
  connectedAddress: string | null | undefined
): Record<string, string> | undefined {
  const hash = connectedPaymentKeyHash.trim().toLowerCase();
  const address = connectedAddress?.trim() ?? "";
  return hash.length > 0 && address.length > 0
    ? { [hash]: address }
    : undefined;
}

export function OwnerAccessEditor({
  user,
  connectedPaymentKeyHash,
  connectedAddress,
  onChange,
  onRemove
}: {
  user: UserFormState;
  connectedPaymentKeyHash?: string | null;
  connectedAddress?: string | null;
  onChange: (value: UserFormState) => void;
  onRemove: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletSettingsEditors");
  const normalizedConnectedHash = connectedPaymentKeyHash?.trim() ?? "";
  const connectedWalletAdded =
    normalizedConnectedHash.length > 0 && user.wallets.includes(normalizedConnectedHash);
  const knownAddresses = buildKnownAddresses(normalizedConnectedHash, connectedAddress);

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{personLabel("Owner", user)}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{i18n("canManageWallet")}</Badge>
            <Badge variant="outline">{formatCountLabel(user.wallets.length, "wallet ID")}</Badge>
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
        knownAddresses={knownAddresses}
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
  connectedPaymentKeyHash,
  connectedAddress,
  onChange,
  onRemove
}: {
  user: UserFormState;
  connectedPaymentKeyHash?: string | null;
  connectedAddress?: string | null;
  onChange: (value: UserFormState) => void;
  onRemove: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletSettingsEditors");
  const walletBalance = useAtomValue(walletBalanceSummaryAtom);
  const knownAddresses = buildKnownAddresses(
    connectedPaymentKeyHash?.trim() ?? "",
    connectedAddress
  );
  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{personLabel("Spender", user)}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{formatCountLabel(user.wallets.length, "wallet ID")}</Badge>
            <Badge variant="outline">{formatCountLabel(user.perDayAllowance.length, "limit")}</Badge>
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
        knownAddresses={knownAddresses}
      />
      <StateAssetAmountListEditor
        label={i18n("dailySpendingLimit")}
        helper={i18n("useLovelaceForAdaOrAddAPolicy")}
        value={user.perDayAllowance}
        onChange={(perDayAllowance) => onChange({ ...user, perDayAllowance })}
        addLabel={i18n("addDailyLimit")}
        availableAssets={walletBalance.assets}
      />
    </div>
  );
}

export function RecoveryAccessEditor({
  beneficiary,
  displayIndex,
  totalWeight,
  connectedPaymentKeyHash,
  connectedAddress,
  onChange,
  onRemove
}: {
  beneficiary: BeneficiaryFormState;
  displayIndex: number;
  totalWeight: number;
  connectedPaymentKeyHash?: string | null;
  connectedAddress?: string | null;
  onChange: (value: BeneficiaryFormState) => void;
  onRemove: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletSettingsEditors");
  const uid = useId();
  const hasPersonalWait = beneficiary.unlockAfterMode === "some";
  const ownWeight = Number.parseInt(beneficiary.weight, 10);
  const sharePercent =
    Number.isFinite(ownWeight) && ownWeight > 0 && totalWeight > 0
      ? ((ownWeight / totalWeight) * 100).toFixed(1)
      : null;
  const knownAddresses = buildKnownAddresses(
    connectedPaymentKeyHash?.trim() ?? "",
    connectedAddress
  );

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{personLabel("Recovery contact", beneficiary)}</p>
          <Badge variant="outline">{formatCountLabel(beneficiary.wallets.length, "wallet ID")}</Badge>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("removeRecoveryContact")}
        </Button>
      </div>
      <WalletHashesEditor
        label={i18n("recoveryWalletIds")}
        helper={i18n("addTheWalletIdsThatMayHelpRecover")}
        value={beneficiary.wallets}
        onChange={(wallets) => onChange({ ...beneficiary, wallets })}
        addLabel={i18n("addRecoveryWallet")}
        knownAddresses={knownAddresses}
      />
      <WalletRuleTogglePanel
        title={i18n("useAPersonalWaitDate")}
        description={i18n("mostWalletsCanRelyOnTheSharedProof")}
        checked={hasPersonalWait}
        onCheckedChange={(checked) =>
          onChange({
            ...beneficiary,
            unlockAfterMode: checked ? "some" : "none",
            unlockAfter:
              checked && !beneficiary.unlockAfter.trim()
                ? defaultSafetyUnlockTimestamp(Date.now())
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
          helper={i18n("chooseTheEarliestLocalDateAndTimeThis_de24bc")}
        />
      </WalletRuleTogglePanel>
      <div className="space-y-1">
        <Label htmlFor={`${uid}-recovery-weight`}>{i18n("recoveryShareWeight")}</Label>
        <Input
          id={`${uid}-recovery-weight`}
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
            ? i18n("thisPersonCanRecoverAboutSharepercentOfThe", { sharePercent: sharePercent, ownWeight: ownWeight, totalWeight: totalWeight })
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
  // The counter used to divide a CHARACTER count by a BYTE limit, so the two disagreed on
  // exactly the names that hit the ceiling. `clampWalletNameInput`
  // (`lib/contracts/state-wallet-name.ts:34-46`) stops accepting input at 32 bytes, and an
  // emoji costs four of them, so a name of eight emoji read "8/32 characters" while the box
  // silently refused the ninth. Count the thing the limit measures.
  const atLimit = byteCount >= MAX_WALLET_NAME_BYTES;
  const displayName = normalizedValue ? normalizeWalletName(value) : "";

  return (
    <div
      className={cn(
        // rounded-lg, one rung in from the card around it and level with the panels it
        // sits beside on the settings surface. It was rounded-xl, the card's own radius.
        "rounded-lg border border-border/70 bg-background/35",
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
        <span className={cn("text-xs", atLimit ? "text-amber-300" : "text-muted-foreground")}>
          {byteCount}/{MAX_WALLET_NAME_BYTES} {i18n("used")}
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
          atLimit ? (
            // The box stops accepting keystrokes here. Saying so beats leaving the reader
            // to work out why their typing stopped.
            "That is as long as a wallet name can be. Emoji and accented letters take up more room than plain letters."
          ) : displayName ? (
            <>
              {i18n("thisWalletWillShowAs")}{" "}
              <span className="font-medium text-foreground">{displayName}</span>.
            </>
          ) : (
            "Add a short name so this wallet is easy to recognize later."
          )
        ) : (
          // A real contract rule, not a screen preference: `eval_update_state`
          // (`smart-contract/lib/stt/operator_handlers.ak:125-131`) requires the wallet
          // name to be unchanged unless the operator path is Admin.
          "Only an owner signing alone can rename this wallet. Choose to sign as a single owner, and this becomes editable."
        )}
      </p>
    </div>
  );
}
