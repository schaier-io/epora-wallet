"use client";
import { useTranslations } from "next-intl";


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
import { formatCompactHash, removeAt, replaceAt, safetyTimerIsReady, withSafetyTimerDefaults } from "@/components/user/workspace/helpers";
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
  existingStreamingPaymentIds = new Set<string>(),
  allowNewStreamingPayments = true,
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
  existingStreamingPaymentIds?: ReadonlySet<string>;
  allowNewStreamingPayments?: boolean;
  zeroAdminConfirmed?: boolean;
  onZeroAdminConfirmedChange?: (value: boolean) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsStateFormEditor");
  const countI18n = useTranslations("Counts");
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
    onChange({ ...value, users: replaceAt(value.users, index, nextUser) });
  }

  function removeUser(index: number) {
    onChange({ ...value, users: removeAt(value.users, index) });
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
              <InfoHint label={i18n("moreAboutLabel", { label: label })} contentClassName="max-w-sm">
                {helper}
              </InfoHint>
            ) : null}
          </div>
          {helper && !helperIsLong ? (
            <p className="text-xs leading-snug text-muted-foreground">{helper}</p>
          ) : null}
          <p className="text-xs leading-snug text-muted-foreground">
            {i18n("decideWhoManagesTheWalletWhoMaySpend")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {normalizedConnectedHash ? (
            <>
              <Badge variant={connectedWalletIsOwner ? "secondary" : "outline"}>
                {connectedWalletIsOwner
                  ? i18n("connectedWalletIsAnOwner")
                  : i18n("connectedValue1", { value1: formatCompactHash(normalizedConnectedHash) })}
              </Badge>
              <InfoHint label={i18n("connectedWalletId")} contentClassName="max-w-sm">
                <span className="break-all font-mono text-xs">{normalizedConnectedHash}</span>
              </InfoHint>
            </>
          ) : null}
          {safetyReady ? (
            <Badge variant="secondary">{i18n("wakeUpTimerReady")}</Badge>
          ) : recoveryNeedsTimer ? (
            <Badge variant="warning">{i18n("recoveryNeedsATimer")}</Badge>
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
          label={i18n("owners_4eaec4")}
          value={countI18n("owner", { count: ownerUsers.length })}
          description={
            ownerUsers.length > 0
              ? i18n("canManagePeopleFundsAndWalletRules")
              : i18n("addAnOwnerOrConfirmAnotherApprovalPath")
          }
          tone={ownerUsers.length > 0 ? "good" : "warn"}
        />
        <WalletRuleSummaryTile
          icon={UsersRound}
          label={i18n("spending")}
          value={countI18n("person", { count: spendingUsers.length })}
          description={i18n("optionalPeopleWithDailySpendingLimits")}
        />
        <WalletRuleSummaryTile
          icon={HandHeart}
          label={i18n("recovery")}
          value={countI18n("person", { count: value.beneficiaries.length })}
          description={
            recoveryNeedsTimer
              ? i18n("turnOnTheWakeUpTimerBeforeRecovery")
              : i18n("optionalOneTimeWithdrawalsAfterTheTimer")
          }
          tone={recoveryNeedsTimer ? "warn" : value.beneficiaries.length > 0 ? "good" : "default"}
        />
        <WalletRuleSummaryTile
          icon={Repeat}
          label={i18n("scheduled")}
          value={countI18n("payment", { count: value.streamingPayments.length })}
          description={i18n("optionalRecurringPayoutsFromThisWallet")}
        />
      </div>

      <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3">
        <p className="text-sm font-medium text-foreground">{i18n("walletSizeLimits")}</p>
        <p className="text-xs text-muted-foreground">
          {i18n("walletSizeLimitsDescription", {
            peopleLimit: MAX_USERS,
            recoveryLimit: MAX_BENEFICIARIES,
            paymentLimit: MAX_STREAMING_PAYMENTS
          })}
        </p>
      </div>

      {adminCount === 0 && onZeroAdminConfirmedChange ? (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-foreground">{i18n("noDirectOwnerYet")}</p>
          <p className="text-xs text-muted-foreground">
            {i18n("noOwnerWillBeAbleToManageThis")}
          </p>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(zeroAdminConfirmed)}
              onChange={(event) => onZeroAdminConfirmedChange(event.target.checked)}
            />
            {i18n("iUnderstandThisWalletHasNoDirectOwner")}
          </label>
        </div>
      ) : null}

      <WalletRuleSection
        icon={ShieldUser}
        title={i18n("whoCanManageThisWallet")}
        description={i18n("ownersCanCreateWalletChangesSendFundsAnd")}
        action={
          <>
            {normalizedConnectedHash && !connectedWalletIsOwner ? (
              <Button type="button" variant="secondary" onClick={useConnectedWalletAsOwner}>
                {i18n("useConnectedWallet")}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => addOwner()}>
              {i18n("addOwner")}
            </Button>
          </>
        }
      >
        {ownerUsers.length === 0 ? (
          <TaskEmptyState
            icon={ShieldUser}
            title={i18n("noOwnerAdded")}
            description={i18n("addAnOwnerUnlessARequiredApprovalGroup")}
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
        title={i18n("peopleWithSpendingLimits")}
        description={i18n("addSomeoneHereWhenTheyShouldBeAble")}
        action={
          <Button type="button" variant="outline" onClick={addSpendingPerson}>
            {i18n("addSpender")}
          </Button>
        }
      >
        {spendingUsers.length === 0 ? (
          <TaskEmptyState
            icon={UsersRound}
            title={i18n("noSpendersYet")}
            description={i18n("addASpenderWhenSomeoneNeedsADaily")}
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
        title={i18n("wakeUpTimer")}
        description={i18n("theWakeUpTimerIsNeededForRecovery")}
      >
        <WalletRuleTogglePanel
          title={i18n("useASafetyTimer")}
          description={i18n("turnThisOnWhenRecoveryContactsAreAdded")}
          checked={safetyEnabled}
          onCheckedChange={setSafetyEnabled}
          enabledLabel={i18n("timerOn")}
          disabledLabel={i18n("timerOff")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <GuidedDateTimeField
              idPrefix={`${label.replace(/\s+/g, "-").toLowerCase()}-safety-unlock`}
              label={i18n("recoveryCanStartAfter")}
              value={value.proofOfLifeUnlockTime}
              onChange={(proofOfLifeUnlockTime) =>
                onChange({
                  ...withSafetyTimerDefaults(value),
                  proofOfLifeUnlockTime
                })
              }
              helper={i18n("chooseTheLocalDateAndTimeWhenRecovery")}
            />
            <GuidedDurationField
              idPrefix={`${label.replace(/\s+/g, "-").toLowerCase()}-safety-extension`}
              label={i18n("ownerCheckInExtendsBy")}
              value={value.proofOfLifeIncrement}
              onChange={(proofOfLifeIncrement) =>
                onChange({
                  ...withSafetyTimerDefaults(value),
                  proofOfLifeIncrement
                })
              }
              helper={i18n("ownersCanKeepRecoveryPushedOutByThis")}
            />
          </div>
        </WalletRuleTogglePanel>
      </WalletRuleSection>

      <WalletRuleSection
        icon={HandHeart}
        title={i18n("recoveryContacts")}
        description={i18n("afterTheWakeUpTimerAndAnyPersonal")}
        action={
          <Button type="button" variant="outline" onClick={addRecoveryPerson}>
            {i18n("addRecoveryContact")}
          </Button>
        }
      >
        {value.beneficiaries.length === 0 ? (
          <TaskEmptyState
            icon={HandHeart}
            title={i18n("noRecoveryContactsYet")}
            description={i18n("noRecoveryContactsCanWithdrawFundsAfterThe")}
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
                    beneficiaries: replaceAt(value.beneficiaries, index, nextBeneficiary)
                  })
                }
                onRemove={() =>
                  onChange({
                    ...value,
                    beneficiaries: removeAt(value.beneficiaries, index)
                  })
                }
              />
            ))}
          </div>
        )}
      </WalletRuleSection>

      <WalletRuleSection
        icon={Repeat}
        title={i18n("scheduledPayments")}
        description={i18n("scheduledAmountsAccrueForAFixedAddressUntil")}
        action={allowNewStreamingPayments ? (
          <Button type="button" variant="outline" onClick={addScheduledPayment}>
            {i18n("addScheduledPayment")}
          </Button>
        ) : undefined}
      >
        {value.streamingPayments.length === 0 ? (
          <TaskEmptyState
            icon={Repeat}
            title={i18n("noSchedulesYet")}
            description={
              allowNewStreamingPayments
                ? i18n("scheduledAmountsAccrueUntilAnEligibleSignerStarts")
                : i18n("existingSchedulesMustStayUnchangedInThisUpdate")
            }
          />
        ) : (
          <div className="space-y-4">
            {value.streamingPayments.map((streamingPayment, index) => (
              <ScheduledPaymentEditor
                key={`scheduled-payment-${index}-${streamingPayment.id}`}
                streamingPayment={streamingPayment}
                displayIndex={index + 1}
                readOnly={existingStreamingPaymentIds.has(streamingPayment.id)}
                onChange={(nextStreamingPayment) =>
                  onChange({
                    ...value,
                    streamingPayments: replaceAt(value.streamingPayments, index, nextStreamingPayment)
                  })
                }
                onRemove={() =>
                  onChange({
                    ...value,
                    streamingPayments: removeAt(value.streamingPayments, index)
                  })
                }
              />
            ))}
          </div>
        )}
      </WalletRuleSection>

      <DisclosureSection
        title={i18n("multipleApprovals")}
        description={i18n("requireCombinedApprovalWeightBeforeSensitiveActionsCan")}
        defaultOpen={multiApprovalEnabled}
      >
        <WalletRuleTogglePanel
          title={i18n("requireMultipleApprovals")}
          description={i18n("turnThisOnToRequireACombinedApproval")}
          checked={multiApprovalEnabled}
          onCheckedChange={setMultiApprovalEnabled}
          enabledLabel={i18n("required")}
          disabledLabel={i18n("notRequired")}
        >
          <div className="space-y-1.5">
            <Label>{i18n("approvalsNeeded")}</Label>
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
        title={i18n("advancedPersonDetails")}
        description={i18n("exactSignerIdsApprovalWeightsAllowanceCountersAnd")}
        defaultOpen={customPeopleNeedAdvanced}
      >
        {value.users.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
            {i18n("noPeopleAdded")}
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
