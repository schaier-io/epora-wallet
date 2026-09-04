"use client";
import { useTranslations } from "next-intl";


import { useId } from "react";

import { ApprovalPowerSlider } from "./approval-power-slider";
import { GuidedDateTimeField, GuidedDurationField } from "./guided-fields";
import { DisclosureSection } from "./primitives";
import { ScheduledPaymentEditor } from "./streaming-editors";
import { TaskEmptyState } from "./task-surface";
import { OwnerAccessEditor, RecoveryAccessEditor, SpendingAccessEditor, WalletNameEditor, WalletRuleSection, WalletRuleTogglePanel } from "./wallet-settings-editors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { Label } from "@/components/ui/label";
import { LONG_DESCRIPTION_LIMIT } from "@/components/user/workspace/constants";
import {
  approvalThresholdCeiling,
  formatCompactHash,
  reachableApprovalPower,
  removeAt,
  replaceAt,
  safetyTimerIsReady,
  withCoSignerAdded,
  withMultisigDerivedFromCoSigners,
  withProofOfLifeIncrement,
  withProofOfLifeUnlockTime,
  withRecoveryContactAdded,
  withSafetyTimerEnabled,
  withScheduledPaymentAdded,
  withUserAdded
} from "@/components/user/workspace/helpers";
import {
  type StateFormState,
  type UserFormState,
  countAdminUsersInStateForm
} from "@/lib/contracts/state-form";
import { MAX_BENEFICIARIES, MAX_STREAMING_PAYMENTS, MAX_USERS } from "@/lib/contracts/state-validation";
import { Clock3, HandHeart, Repeat, ShieldUser, UsersRound } from "lucide-react";

export function StateFormEditor({
  label,
  helper,
  value,
  onChange,
  connectedPaymentKeyHash,
  connectedAddress,
  walletNameEditable = true,
  showWalletNameEditor = true,
  existingStreamingPaymentIds = new Set<string>(),
  allowNewStreamingPayments = true,
  moreSettingsCollapsed = false,
  zeroAdminConfirmed,
  onZeroAdminConfirmedChange
}: {
  label: string;
  helper?: string;
  value: StateFormState;
  onChange: (value: StateFormState) => void;
  connectedPaymentKeyHash?: string | null;
  /** The connected wallet's address, so its wallet id can be shown as an address too. */
  connectedAddress?: string | null;
  sttPolicyId?: string | null;
  sttAssetNameHex?: string | null;
  walletNameEditable?: boolean;
  showWalletNameEditor?: boolean;
  existingStreamingPaymentIds?: ReadonlySet<string>;
  allowNewStreamingPayments?: boolean;
  /** Create flow: everything past the owners sits behind one "More settings" disclosure. */
  moreSettingsCollapsed?: boolean;
  zeroAdminConfirmed?: boolean;
  onZeroAdminConfirmedChange?: (value: boolean) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsStateFormEditor");
  const uid = useId();
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
  // The approval rule is whoever holds a Co-signer chip — there is no separate
  // on/off any more, so the section opens only when the chips already say "on".
  const hasCoSigners = value.users.some((user) => user.multiSigPowerMode === "some");
  const multiSigThresholdNeeded = Number.parseInt(value.multiSigThreshold, 10);
  const reachablePower = reachableApprovalPower(value.users);
  const multiSigThresholdIsWorkable =
    Number.isFinite(multiSigThresholdNeeded) &&
    multiSigThresholdNeeded > 0 &&
    multiSigThresholdNeeded <= reachablePower;
  // Owners and spenders share one cap (`smart-contract/lib/state/configuration.ak:100`).
  const peopleAtCap = value.users.length >= MAX_USERS;
  const recoveryAtCap = value.beneficiaries.length >= MAX_BENEFICIARIES;
  const scheduledAtCap = value.streamingPayments.length >= MAX_STREAMING_PAYMENTS;
  const hasMoreSettings =
    spendingUsers.length > 0 ||
    value.beneficiaries.length > 0 ||
    value.streamingPayments.length > 0 ||
    safetyEnabled ||
    hasCoSigners;
  const helperIsLong = Boolean(helper && helper.length > LONG_DESCRIPTION_LIMIT);

  function updateUser(index: number, nextUser: UserFormState) {
    onChange({ ...value, users: replaceAt(value.users, index, nextUser) });
  }

  function removeUser(index: number) {
    onChange({ ...value, users: removeAt(value.users, index) });
  }

  function addOwner(walletId?: string) {
    onChange(withUserAdded(value, "admin", walletId));
  }

  function useConnectedWalletAsOwner() {
    if (!normalizedConnectedHash || connectedWalletIsOwner) {
      return;
    }

    const firstOwner = ownerUsers[0];
    if (!firstOwner) {
      if (!peopleAtCap) {
        addOwner(normalizedConnectedHash);
      }
      return;
    }

    updateUser(firstOwner.index, {
      ...firstOwner.user,
      wallets: [...firstOwner.user.wallets, normalizedConnectedHash]
    });
  }

  function addSpendingPerson() {
    onChange(withUserAdded(value, "limited-withdrawal"));
  }

  function addRecoveryPerson() {
    onChange(withRecoveryContactAdded(value, Date.now()));
  }

  function addScheduledPayment() {
    onChange(withScheduledPaymentAdded(value));
  }

  function setSafetyEnabled(checked: boolean) {
    onChange(withSafetyTimerEnabled(value, checked, Date.now()));
  }

  const moreSettings = (
    <>
      <WalletRuleSection
        icon={UsersRound}
        title={i18n("spenders")}
        description={i18n("aSpenderCanSendFundsUpToA")}
        action={
          <Button type="button" variant="outline" onClick={addSpendingPerson} disabled={peopleAtCap}>
            {i18n("addSpender")}
          </Button>
        }
      >
        {spendingUsers.length === 0 ? (
          <TaskEmptyState
            icon={UsersRound}
            title={i18n("noSpendersYet")}
            description={i18n("wantSomeoneElseToSpendUpToA")}
          />
        ) : (
          <div className="space-y-4">
            {spendingUsers.map(({ user, index }) => (
              <SpendingAccessEditor
                key={`spending-${index}-${user.id}`}
                user={user}
                connectedPaymentKeyHash={normalizedConnectedHash}
                connectedAddress={connectedAddress}
                onChange={(nextUser) => updateUser(index, nextUser)}
                onRemove={() => removeUser(index)}
              />
            ))}
          </div>
        )}
        {peopleAtCap ? (
          <p className="text-xs text-muted-foreground">
            {i18n("thisWalletAlreadyHoldsMaxPeople", { max: MAX_USERS })}
          </p>
        ) : null}
      </WalletRuleSection>

      <WalletRuleSection
        icon={Clock3}
        title={i18n("proofOfLife")}
        description={i18n("howLongYouHaveBetweenCheckInsBefore")}
      >
        <WalletRuleTogglePanel
          title={i18n("requireProofOfLife")}
          description={i18n("turnThisOnSoRecoveryContactsCanAct")}
          checked={safetyEnabled}
          onCheckedChange={setSafetyEnabled}
          enabledLabel={i18n("timerOn")}
          disabledLabel={i18n("timerOff")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <GuidedDateTimeField
              idPrefix={`${label.replace(/\s+/g, "-").toLowerCase()}-proof-of-life-unlock`}
              label={i18n("recoveryContactsCanClaimAfter")}
              value={value.proofOfLifeUnlockTime}
              onChange={(proofOfLifeUnlockTime) =>
                onChange(withProofOfLifeUnlockTime(value, proofOfLifeUnlockTime, Date.now()))
              }
              helper={i18n("untilThisTimeOnlyTheOwnersCanUse")}
            />
            <GuidedDurationField
              idPrefix={`${label.replace(/\s+/g, "-").toLowerCase()}-proof-of-life-extension`}
              label={i18n("timeEachCheckInBuys")}
              value={value.proofOfLifeIncrement}
              onChange={(proofOfLifeIncrement) =>
                onChange(withProofOfLifeIncrement(value, proofOfLifeIncrement, Date.now()))
              }
              helper={i18n("checkingInMovesTheDateBesideThisTo")}
            />
          </div>
        </WalletRuleTogglePanel>
      </WalletRuleSection>

      <WalletRuleSection
        icon={HandHeart}
        title={i18n("recoveryContacts")}
        description={i18n("addingOneTurnsOnProofOfLifeSo")}
        action={
          <Button type="button" variant="outline" onClick={addRecoveryPerson} disabled={recoveryAtCap}>
            {i18n("addRecoveryContact")}
          </Button>
        }
      >
        {value.beneficiaries.length === 0 ? (
          <TaskEmptyState
            icon={HandHeart}
            title={i18n("noRecoveryContactsYet")}
            description={i18n("ifYouEverLoseYourKeysRecoveryContacts")}
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
                connectedPaymentKeyHash={normalizedConnectedHash}
                connectedAddress={connectedAddress}
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
        {recoveryAtCap ? (
          <p className="text-xs text-muted-foreground">
            {i18n("thisWalletAlreadyHoldsMaxRecoveryContacts", { max: MAX_BENEFICIARIES })}
          </p>
        ) : null}
      </WalletRuleSection>

      <WalletRuleSection
        icon={Repeat}
        title={i18n("scheduledPayments")}
        description={i18n("useThisForRecurringPayoutsToAFixed")}
        action={allowNewStreamingPayments ? (
          <Button type="button" variant="outline" onClick={addScheduledPayment} disabled={scheduledAtCap}>
            {i18n("addScheduledPayment")}
          </Button>
        ) : undefined}
      >
        {value.streamingPayments.length === 0 ? (
          <TaskEmptyState
            icon={Repeat}
            title={i18n("noScheduledPaymentsYet")}
            description={
              allowNewStreamingPayments
                ? i18n("youCanAlwaysSendManuallySchedulesJustSave")
                : i18n("existingSchedulesMustBeForwardedUnchangedInThis")
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
        {scheduledAtCap && allowNewStreamingPayments ? (
          <p className="text-xs text-muted-foreground">
            {i18n("thisWalletAlreadyHoldsMaxScheduledPayments", { max: MAX_STREAMING_PAYMENTS })}
          </p>
        ) : null}
      </WalletRuleSection>

      {/* Create flow: nothing there sets per-person approval power, so a threshold could
          exceed the wallet's total power and lock it. The threshold is set after minting. */}
      {moreSettingsCollapsed ? null : (
      <DisclosureSection
        title={i18n("coSignerThreshold")}
        description={i18n("theWalletActsOnceApprovingPeopleHoldEnough")}
        defaultOpen={hasCoSigners}
      >
        {/*
         * The old panel led with a Yes/No that could disagree with the Co-signer
         * chips it summarised. The chips are the rule now: this section only reads
         * the derived threshold, and "Add a co-signer" is the way to turn it on from
         * here (the People page chips are the other way).
        */}
        {hasCoSigners ? (
          <div className="space-y-1">
            <Label id={`${uid}-approvals-needed-label`}>{i18n("approvalPowerNeeded")}</Label>
            <ApprovalPowerSlider
              id={`${uid}-approvals-needed`}
              labelledBy={`${uid}-approvals-needed-label`}
              value={value.multiSigThreshold}
              onChange={(multiSigThreshold) => onChange({ ...value, multiSigThreshold })}
              min={1}
              max={approvalThresholdCeiling(value)}
              fullAt={reachablePower}
              fullAtHint={i18n("everyCosignerHasToApprove")}
              invalid={!multiSigThresholdIsWorkable}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {i18n("nobodyHoldsACosignerChipYetSo")}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                onChange(withMultisigDerivedFromCoSigners(withCoSignerAdded(value)))
              }
            >
              {i18n("addACosigner")}
            </Button>
          </div>
        )}
      </DisclosureSection>
      )}
    </>
  );

  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-background/40 p-3 sm:p-4">
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
            {i18n("buildTheWalletAroundTheJobsItNeeds")}
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
            <Badge variant="secondary">{i18n("proofOfLifeReady")}</Badge>
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

      {adminCount === 0 && onZeroAdminConfirmedChange ? (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-foreground">{i18n("noDirectOwnerYet")}</p>
          <p className="text-xs text-muted-foreground">
            {i18n("thisWalletWillNotHaveSomeoneWhoCan")}
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
        description={i18n("ownersCanChangeTheWalletSendFundsAnd")}
        action={
          <>
            {normalizedConnectedHash && !connectedWalletIsOwner ? (
              <Button
                type="button"
                variant="secondary"
                onClick={useConnectedWalletAsOwner}
                disabled={peopleAtCap && ownerUsers.length === 0}
              >
                {i18n("useConnectedWallet")}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => addOwner()} disabled={peopleAtCap}>
              {i18n("addOwner")}
            </Button>
          </>
        }
      >
        {ownerUsers.length === 0 ? (
          <TaskEmptyState
            icon={ShieldUser}
            title={i18n("noOwnerAdded")}
            description={i18n("addAnOwnerUnlessRecoveryContactsOrApprovals")}
          />
        ) : (
          <div className="space-y-4">
            {ownerUsers.map(({ user, index }) => (
              <OwnerAccessEditor
                key={`owner-${index}-${user.id}`}
                user={user}
                connectedPaymentKeyHash={normalizedConnectedHash}
                connectedAddress={connectedAddress}
                onChange={(nextUser) => updateUser(index, nextUser)}
                onRemove={() => removeUser(index)}
              />
            ))}
          </div>
        )}
        {peopleAtCap ? (
          <p className="text-xs text-muted-foreground">
            {i18n("thisWalletAlreadyHoldsMaxPeople", { max: MAX_USERS })}
          </p>
        ) : null}
      </WalletRuleSection>

      {moreSettingsCollapsed ? (
        <DisclosureSection
          title={i18n("moreSettings")}
          description={i18n("spendersProofOfLifeRecoveryContactsScheduled")}
          defaultOpen={hasMoreSettings}
        >
          {moreSettings}
        </DisclosureSection>
      ) : (
        moreSettings
      )}
    </div>
  );
}
