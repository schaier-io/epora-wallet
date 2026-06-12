"use client";

import { GuidedDateTimeField, GuidedDurationField } from "./guided-fields";
import { UserEditor } from "./people-editors";
import { DisclosureSection } from "./primitives";
import { ScheduledPaymentEditor } from "./streaming-editors";
import { TaskEmptyState } from "./task-surface";
import { OwnerAccessEditor, RecoveryAccessEditor, SpendingAccessEditor, WalletNameEditor, WalletRuleSection, WalletRuleSummaryTile, WalletRuleTogglePanel } from "./wallet-settings-editors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LONG_DESCRIPTION_LIMIT } from "@/components/user/workspace/constants";
import { formatCompactHash, formatCountLabel, safetyTimerIsReady, withSafetyTimerDefaults } from "@/components/user/workspace/helpers";
import { type StateFormState, type UserFormState, applyUserPreset, countAdminUsersInStateForm, createDefaultBeneficiaryFormState, createDefaultStreamingPaymentFormState, createDefaultUserFormState, nextGeneratedId } from "@/lib/contracts/state-form";
import { MAX_BENEFICIARIES, MAX_STREAMING_PAYMENTS, MAX_USERS } from "@/lib/contracts/state-validation";
import { Clock3, HandHeart, Repeat, ShieldUser, UsersRound } from "lucide-react";

export function StateFormEditor({
  label,
  helper,
  value,
  onChange,
  connectedPaymentKeyHash,
  walletNameEditable = true,
  showWalletNameEditor = true,
  zeroAdminConfirmed,
  onZeroAdminConfirmedChange
}: {
  label: string;
  helper?: string;
  value: StateFormState;
  onChange: (value: StateFormState) => void;
  connectedPaymentKeyHash?: string | null;
  sttPolicyId?: string | null;
  sttAssetNameHex?: string | null;
  walletNameEditable?: boolean;
  showWalletNameEditor?: boolean;
  zeroAdminConfirmed?: boolean;
  onZeroAdminConfirmedChange?: (value: boolean) => void;
}) {
  const adminCount = countAdminUsersInStateForm(value);
  const ownerUsers = value.users
    .map((user, index) => ({ user, index }))
    .filter(({ user }) => user.isAdmin);
  const spendingUsers = value.users
    .map((user, index) => ({ user, index }))
    .filter(({ user }) => !user.isAdmin);
  const normalizedConnectedHash = connectedPaymentKeyHash?.trim() ?? "";
  const connectedWalletIsOwner =
    normalizedConnectedHash.length > 0 &&
    value.users.some((user) => user.isAdmin && user.wallets.includes(normalizedConnectedHash));
  const safetyEnabled =
    value.proofOfLifeUnlockTimeMode === "some" ||
    value.proofOfLifeIncrementMode === "some";
  const safetyReady = safetyTimerIsReady(value);
  const recoveryNeedsTimer = value.beneficiaries.length > 0 && !safetyReady;
  const multiApprovalEnabled = value.multiSigThresholdMode === "some";
  const customPeopleNeedAdvanced = value.users.some(
    (user) =>
      user.preset === "custom" ||
      user.multiSigPowerMode === "some" ||
      user.canRenewProofOfLife !== user.isAdmin
  );
  const helperIsLong = Boolean(helper && helper.length > LONG_DESCRIPTION_LIMIT);

  function updateUser(index: number, nextUser: UserFormState) {
    onChange({
      ...value,
      users: value.users.map((entry, entryIndex) =>
        entryIndex === index ? nextUser : entry
      )
    });
  }

  function removeUser(index: number) {
    onChange({
      ...value,
      users: value.users.filter((_, entryIndex) => entryIndex !== index)
    });
  }

  function addOwner(walletId?: string) {
    const normalizedWalletId = walletId?.trim() ?? "";
    onChange({
      ...value,
      users: [
        ...value.users,
        applyUserPreset(
          {
            ...createDefaultUserFormState(nextGeneratedId(value.users)),
            wallets: normalizedWalletId ? [normalizedWalletId] : []
          },
          "admin"
        )
      ]
    });
  }

  function useConnectedWalletAsOwner() {
    if (!normalizedConnectedHash || connectedWalletIsOwner) {
      return;
    }

    const firstOwner = ownerUsers[0];
    if (!firstOwner) {
      addOwner(normalizedConnectedHash);
      return;
    }

    updateUser(firstOwner.index, {
      ...firstOwner.user,
      wallets: [...firstOwner.user.wallets, normalizedConnectedHash]
    });
  }

  function addSpendingPerson() {
    onChange({
      ...value,
      users: [
        ...value.users,
        applyUserPreset(
          createDefaultUserFormState(nextGeneratedId(value.users)),
          "limited-withdrawal"
        )
      ]
    });
  }

  function addRecoveryPerson() {
    onChange(
      withSafetyTimerDefaults({
        ...value,
        beneficiaries: [
          ...value.beneficiaries,
          createDefaultBeneficiaryFormState(nextGeneratedId(value.beneficiaries))
        ]
      })
    );
  }

  function addScheduledPayment() {
    onChange({
      ...value,
      streamingPayments: [
        ...value.streamingPayments,
        createDefaultStreamingPaymentFormState(nextGeneratedId(value.streamingPayments))
      ]
    });
  }

  function setSafetyEnabled(checked: boolean) {
    if (checked) {
      onChange(withSafetyTimerDefaults(value));
      return;
    }

    onChange({
      ...value,
      proofOfLifeUnlockTimeMode: "none",
      proofOfLifeIncrementMode: "none"
    });
  }

  function setMultiApprovalEnabled(checked: boolean) {
    onChange({
      ...value,
      multiSigThresholdMode: checked ? "some" : "none",
      multiSigThreshold:
        checked && !value.multiSigThreshold.trim() ? "2" : value.multiSigThreshold
    });
  }

  return (
    <div className="space-y-5 rounded-xl border border-border/70 bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Label>{label}</Label>
            {helperIsLong ? (
              <InfoHint label={`More about ${label}`} contentClassName="max-w-sm">
                {helper}
              </InfoHint>
            ) : null}
          </div>
          {helper && !helperIsLong ? (
            <p className="text-xs leading-snug text-muted-foreground">{helper}</p>
          ) : null}
          <p className="text-xs leading-snug text-muted-foreground">
            Build the wallet around the jobs it needs to do: manage, spend, recover, and send
            scheduled payments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {normalizedConnectedHash ? (
            <>
              <Badge variant={connectedWalletIsOwner ? "secondary" : "outline"}>
                {connectedWalletIsOwner
                  ? "Connected wallet is an owner"
                  : `Connected ${formatCompactHash(normalizedConnectedHash)}`}
              </Badge>
              <InfoHint label="Connected wallet ID" contentClassName="max-w-sm">
                <span className="break-all font-mono text-xs">{normalizedConnectedHash}</span>
              </InfoHint>
            </>
          ) : null}
          {safetyReady ? (
            <Badge variant="secondary">Wake-up timer ready</Badge>
          ) : recoveryNeedsTimer ? (
            <Badge variant="warning">Recovery needs a timer</Badge>
          ) : null}
        </div>
      </div>

      {showWalletNameEditor ? (
        <WalletNameEditor
          value={value.walletName}
          onChange={(walletName) => onChange({ ...value, walletName })}
          editable={walletNameEditable}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <WalletRuleSummaryTile
          icon={ShieldUser}
          label="Owners"
          value={formatCountLabel(ownerUsers.length, "owner")}
          description={
            ownerUsers.length > 0
              ? "Can manage people, funds, and wallet rules."
              : "Add an owner or a clear recovery path."
          }
          tone={ownerUsers.length > 0 ? "good" : "warn"}
        />
        <WalletRuleSummaryTile
          icon={UsersRound}
          label="Spending"
          value={formatCountLabel(spendingUsers.length, "person", "people")}
          description="Optional people with daily spending limits."
        />
        <WalletRuleSummaryTile
          icon={HandHeart}
          label="Recovery"
          value={formatCountLabel(value.beneficiaries.length, "person", "people")}
          description={
            recoveryNeedsTimer
              ? "Turn on the safety timer before recovery can be used."
              : "Optional recovery access for later."
          }
          tone={recoveryNeedsTimer ? "warn" : value.beneficiaries.length > 0 ? "good" : "default"}
        />
        <WalletRuleSummaryTile
          icon={Repeat}
          label="Scheduled"
          value={formatCountLabel(value.streamingPayments.length, "payment")}
          description="Optional recurring payouts from this wallet."
        />
      </div>

      <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3">
        <p className="text-sm font-medium text-foreground">Kept within safe limits</p>
        <p className="text-xs text-muted-foreground">
          A wallet can hold up to {MAX_USERS} owners, {MAX_BENEFICIARIES} recovery
          contacts, and {MAX_STREAMING_PAYMENTS} scheduled payments. These limits keep
          every wallet action affordable on-chain. Adding an entry is the most
          demanding change, so it is refused first if a wallet would grow too large,
          and a single entry can always be removed cheaply, so a wallet can never get
          stuck.
        </p>
      </div>

      {adminCount === 0 && onZeroAdminConfirmedChange ? (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-foreground">No direct owner yet</p>
          <p className="text-xs text-muted-foreground">
            This wallet will not have someone who can manage it directly. Keep this only when
            another path can safely use the wallet.
          </p>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(zeroAdminConfirmed)}
              onChange={(event) => onZeroAdminConfirmedChange(event.target.checked)}
            />
            I understand this wallet has no direct owner.
          </label>
        </div>
      ) : null}

      <WalletRuleSection
        icon={ShieldUser}
        title="Who can manage this wallet"
        description="Owners can create wallet changes, send funds, and manage recovery or scheduled payments."
        action={
          <>
            {normalizedConnectedHash && !connectedWalletIsOwner ? (
              <Button type="button" variant="secondary" onClick={useConnectedWalletAsOwner}>
                Use connected wallet
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => addOwner()}>
              Add owner
            </Button>
          </>
        }
      >
        {ownerUsers.length === 0 ? (
          <TaskEmptyState
            icon={ShieldUser}
            title="No owner added"
            description="Add an owner wallet unless this wallet is intentionally controlled by another safe path."
          />
        ) : (
          <div className="space-y-4">
            {ownerUsers.map(({ user, index }, ownerIndex) => (
              <OwnerAccessEditor
                key={`owner-${index}-${user.id}`}
                user={user}
                displayIndex={ownerIndex + 1}
                connectedPaymentKeyHash={normalizedConnectedHash}
                onChange={(nextUser) => updateUser(index, nextUser)}
                onRemove={() => removeUser(index)}
              />
            ))}
          </div>
        )}
      </WalletRuleSection>

      <WalletRuleSection
        icon={UsersRound}
        title="People with spending limits"
        description="Add someone here when they should be able to spend only within a daily allowance."
        action={
          <Button type="button" variant="outline" onClick={addSpendingPerson}>
            Add spending person
          </Button>
        }
      >
        {spendingUsers.length === 0 ? (
          <TaskEmptyState
            icon={UsersRound}
            title="No spenders yet"
            description="Want someone else to spend up to a daily limit? Add them here."
          />
        ) : (
          <div className="space-y-4">
            {spendingUsers.map(({ user, index }, spendingIndex) => (
              <SpendingAccessEditor
                key={`spending-${index}-${user.id}`}
                user={user}
                displayIndex={spendingIndex + 1}
                onChange={(nextUser) => updateUser(index, nextUser)}
                onRemove={() => removeUser(index)}
              />
            ))}
          </div>
        )}
      </WalletRuleSection>

      <WalletRuleSection
        icon={Clock3}
        title="Wake-up timer"
        description="The wake-up timer is needed for recovery. It sets the first recovery date and how far owners can extend that date later."
      >
        <WalletRuleTogglePanel
          title="Use a safety timer"
          description="Turn this on when recovery contacts are added. The default starts with a 30-day window and can be changed below."
          checked={safetyEnabled}
          onCheckedChange={setSafetyEnabled}
          enabledLabel="Timer on"
          disabledLabel="Timer off"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <GuidedDateTimeField
              idPrefix={`${label.replace(/\s+/g, "-").toLowerCase()}-safety-unlock`}
              label="Recovery can start after"
              value={value.proofOfLifeUnlockTime}
              onChange={(proofOfLifeUnlockTime) =>
                onChange({
                  ...withSafetyTimerDefaults(value),
                  proofOfLifeUnlockTime
                })
              }
              helper="Choose the local date and time when recovery may begin."
            />
            <GuidedDurationField
              idPrefix={`${label.replace(/\s+/g, "-").toLowerCase()}-safety-extension`}
              label="Owner check-in extends by"
              value={value.proofOfLifeIncrement}
              onChange={(proofOfLifeIncrement) =>
                onChange({
                  ...withSafetyTimerDefaults(value),
                  proofOfLifeIncrement
                })
              }
              helper="Owners can keep recovery pushed out by this amount."
            />
          </div>
        </WalletRuleTogglePanel>
      </WalletRuleSection>

      <WalletRuleSection
        icon={HandHeart}
        title="Recovery contacts"
        description="Recovery contacts are optional recovery access. Adding one automatically turns on the safety timer so the wallet stays usable."
        action={
          <Button type="button" variant="outline" onClick={addRecoveryPerson}>
            Add recovery contact
          </Button>
        }
      >
        {value.beneficiaries.length === 0 ? (
          <TaskEmptyState
            icon={HandHeart}
            title="No recovery contacts yet"
            description="If you ever lose your keys, recovery contacts can step in. They wait behind the safety timer."
          />
        ) : (
          <div className="space-y-4">
            {value.beneficiaries.map((beneficiary, index) => (
              <RecoveryAccessEditor
                key={`recovery-${index}-${beneficiary.id}`}
                beneficiary={beneficiary}
                displayIndex={index + 1}
                totalWeight={value.beneficiaries.reduce(
                  (sum, entry) => sum + (Number.parseInt(entry.weight, 10) || 0),
                  0
                )}
                onChange={(nextBeneficiary) =>
                  onChange({
                    ...value,
                    beneficiaries: value.beneficiaries.map((entry, entryIndex) =>
                      entryIndex === index ? nextBeneficiary : entry
                    )
                  })
                }
                onRemove={() =>
                  onChange({
                    ...value,
                    beneficiaries: value.beneficiaries.filter(
                      (_, entryIndex) => entryIndex !== index
                    )
                  })
                }
              />
            ))}
          </div>
        )}
      </WalletRuleSection>

      <WalletRuleSection
        icon={Repeat}
        title="Scheduled payments"
        description="Use this for recurring payouts to a fixed address. Leave it empty when the wallet only sends manually."
        action={
          <Button type="button" variant="outline" onClick={addScheduledPayment}>
            Add scheduled payment
          </Button>
        }
      >
        {value.streamingPayments.length === 0 ? (
          <TaskEmptyState
            icon={Repeat}
            title="No schedules yet"
            description="You can always send manually. Schedules just save you the click."
          />
        ) : (
          <div className="space-y-4">
            {value.streamingPayments.map((streamingPayment, index) => (
              <ScheduledPaymentEditor
                key={`scheduled-payment-${index}-${streamingPayment.id}`}
                streamingPayment={streamingPayment}
                displayIndex={index + 1}
                onChange={(nextStreamingPayment) =>
                  onChange({
                    ...value,
                    streamingPayments: value.streamingPayments.map((entry, entryIndex) =>
                      entryIndex === index ? nextStreamingPayment : entry
                    )
                  })
                }
                onRemove={() =>
                  onChange({
                    ...value,
                    streamingPayments: value.streamingPayments.filter(
                      (_, entryIndex) => entryIndex !== index
                    )
                  })
                }
              />
            ))}
          </div>
        )}
      </WalletRuleSection>

      <DisclosureSection
        title="Multiple approvals"
        description="Use this only when a wallet action should need more than one approval. Normal owner-only wallets can leave it off."
        defaultOpen={multiApprovalEnabled}
      >
        <WalletRuleTogglePanel
          title="Require multiple approvals"
          description="Turn this on when the wallet should count approval power from configured people before an action can run."
          checked={multiApprovalEnabled}
          onCheckedChange={setMultiApprovalEnabled}
          enabledLabel="Required"
          disabledLabel="Not required"
        >
          <div className="space-y-1.5">
            <Label>Approvals needed</Label>
            <Input
              value={value.multiSigThreshold}
              onChange={(event) =>
                onChange({ ...value, multiSigThreshold: event.target.value })
              }
              placeholder="2"
            />
          </div>
        </WalletRuleTogglePanel>
      </DisclosureSection>

      <DisclosureSection
        title="Advanced person details"
        description="Open this only for custom contract-level fields such as exact IDs, approval power, current allowance counters, or renew-access flags."
        defaultOpen={customPeopleNeedAdvanced}
      >
        {value.users.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
            No people added.
          </p>
        ) : (
          <div className="space-y-4">
            {value.users.map((user, index) => (
              <UserEditor
                key={`advanced-user-${index}-${user.id}`}
                user={user}
                index={index}
                onChange={(nextUser) => updateUser(index, nextUser)}
                onRemove={() => removeUser(index)}
              />
            ))}
          </div>
        )}
      </DisclosureSection>
    </div>
  );
}

