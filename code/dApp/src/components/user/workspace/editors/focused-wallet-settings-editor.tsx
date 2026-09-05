"use client";
import { useTranslations } from "next-intl";


import { useId } from "react";

import { GuidedDateTimeField, GuidedDurationField } from "./guided-fields";
import { BeneficiaryEditor, MultisigThresholdEditor } from "./people-editors";
import { FocusedPeopleEditor } from "./focused-people-editor";
import { FocusedTaskSurface, TaskEmptyState, ZeroAdminConfirmationCallout } from "./task-surface";
import { WalletNameEditor } from "./wallet-settings-editors";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { type FieldErrors, type UserWorkspaceTask } from "@/components/user/flow-types";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/guided-admin-catalog";
import {
  countFieldErrorMessages,
  formatCountLabel,
  withProofOfLifeIncrement,
  withProofOfLifeUnlockTime,
  withRecoveryContactAdded,
  withSafetyTimerEnabled
} from "@/components/user/workspace/helpers";
import { type StateFormState, countAdminUsersInStateForm } from "@/lib/contracts/state-form";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import {
  MAX_ACCESS_RECORDS,
  MAX_BENEFICIARIES,
  MAX_BENEFICIARY_WALLETS,
  MAX_TOTAL_BENEFICIARY_WALLETS
} from "@/lib/contracts/state-validation";
import { countWalletEntries } from "@/lib/contracts/wallet-capacity";
import { HandHeart, Plus, Settings2 } from "lucide-react";

function ProofOfLifeSettingsEditor({
  label,
  value,
  onChange
}: {
  label: string;
  value: StateFormState;
  onChange: (value: StateFormState) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedWalletSettingsEditor");
  const uid = useId();
  // One control, not two. The contract requires the deadline and the check-in length to be
  // set together: `expect_valid_settings`
  // (`smart-contract/lib/state/proof_of_life.ak:31-40`) rejects a pair where exactly one is
  // present. The screen offered a separate None/Some select for each, so a reader could
  // build a wallet the validator will not accept and only find out at the receipt.
  // The shared timer transition also fills both fields with working values instead of
  // leaving two empty boxes.
  const timerEnabled =
    value.proofOfLifeUnlockTimeMode === "some" || value.proofOfLifeIncrementMode === "some";
  const idPrefix = label.replace(/\s+/g, "-").toLowerCase();

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-start">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-timer-enabled`}>{i18n("requireProofOfLife")}</Label>
          <p className="text-xs text-muted-foreground">
            {timerEnabled
              ? i18n("checkInBeforeTheDateBelowToPush")
              : i18n("turnThisOnSoYourRecoveryContactsCan")}
          </p>
        </div>
        <Select
          id={`${uid}-timer-enabled`}
          value={timerEnabled ? "some" : "none"}
          onChange={(event) =>
            onChange(withSafetyTimerEnabled(value, event.target.value === "some", Date.now()))
          }
        >
          <option value="none">{i18n("no")}</option>
          <option value="some">{i18n("yes")}</option>
        </Select>
      </div>
      {timerEnabled ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border/50 bg-background/35 p-3 sm:p-4">
            <GuidedDateTimeField
              idPrefix={`${idPrefix}-proof-of-life-unlock`}
              label={i18n("recoveryContactsCanClaimAfter")}
              value={value.proofOfLifeUnlockTime}
              onChange={(proofOfLifeUnlockTime) =>
                onChange(withProofOfLifeUnlockTime(value, proofOfLifeUnlockTime, Date.now()))
              }
              helper={i18n("untilThisTimeOnlyTheOwnersCanUse")}
            />
          </div>
          {/* `increment` is a cap on one check-in, not a period: a renewal must satisfy
              `updated_unlock_time <= tx_earliest_time + increment`
              (`proof_of_life.ak:124`). The old helper described the widget instead
              ("Use a human-sized interval instead of typing milliseconds."). */}
          <div className="rounded-lg border border-border/50 bg-background/35 p-3 sm:p-4">
            <GuidedDurationField
              idPrefix={`${idPrefix}-proof-of-life-increment`}
              label={i18n("timeEachCheckInBuys")}
              value={value.proofOfLifeIncrement}
              onChange={(proofOfLifeIncrement) =>
                onChange(withProofOfLifeIncrement(value, proofOfLifeIncrement, Date.now()))
              }
              helper={i18n("checkingInMovesTheDateBesideThisTo")}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The people the proof-of-life timer hands the wallet to, with the add. One section,
 * two tabs: the recovery tab owns the full editing, and the timer tab lists the same
 * contacts beneath the deadline — a timer without anyone to act on it is only half
 * the arrangement. Both edit the same form state, and `withRecoveryContactAdded`
 * fills in the timer halves the contract requires together.
 */
function RecoveryContactsSection({
  value,
  onChange
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedWalletSettingsEditor");
  const recoveryAtCap =
    value.beneficiaries.length >= MAX_BENEFICIARIES ||
    value.users.length + value.beneficiaries.length >= MAX_ACCESS_RECORDS;
  const canAddBeneficiaryWalletEntry =
    countWalletEntries(value.beneficiaries) < MAX_TOTAL_BENEFICIARY_WALLETS;
  const addRecoveryContact = () => {
    if (!recoveryAtCap) {
      onChange(withRecoveryContactAdded(value, Date.now()));
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* "Edit your recovery contacts here." described the form and never said what
            a recovery contact is for or when one may act. Both gates matter:
            `smart-contract/lib/state/types.ak:39-41` requires the wallet's
            proof-of-life window AND the contact's own `unlock_after` to have passed. */}
        <p className="text-sm text-muted-foreground">
          {i18n("ifYouStopCheckingInAndTheProof")}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="ml-auto"
          onClick={addRecoveryContact}
          disabled={recoveryAtCap}
        >
          <Plus className="h-4 w-4" />
          {i18n("addRecoveryContact")}
        </Button>
      </div>
      {value.beneficiaries.length === 0 ? (
        <TaskEmptyState
          icon={HandHeart}
          title={i18n("nobodyCanRecoverThisWallet")}
          // Kept under LONG_DESCRIPTION_LIMIT (78) so `TaskEmptyState` renders it as
          // visible text rather than folding it into an InfoHint.
          description={i18n("addSomeoneWhoCanClaimWhatIsHere")}
        />
      ) : (
        value.beneficiaries.map((beneficiary, index) => (
          <BeneficiaryEditor
            key={`focused-beneficiary-${index}-${beneficiary.id}`}
            beneficiary={beneficiary}
            index={index}
            totalWeight={value.beneficiaries.reduce(
              (sum, entry) => sum + (Number.parseInt(entry.weight, 10) || 0),
              0
            )}
            canAddWallet={
              canAddBeneficiaryWalletEntry &&
              beneficiary.wallets.length < MAX_BENEFICIARY_WALLETS
            }
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
        ))
      )}
    </>
  );
}

export function FocusedWalletSettingsEditor({
  value,
  onChange,
  selectedTask,
  onSelectTask,
  fieldErrors,
  walletNameEditable = true,
  zeroAdminConfirmed,
  onZeroAdminConfirmedChange
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
  selectedTask: UserWorkspaceTask | null;
  onSelectTask: (task: UserWorkspaceTask) => void;
  fieldErrors: FieldErrors;
  walletNameEditable?: boolean;
  zeroAdminConfirmed?: boolean;
  onZeroAdminConfirmedChange?: (value: boolean) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsFocusedWalletSettingsEditor");
  const tasks = GUIDED_ADMIN_TASKS.filter((task) => task.group === "wallet-settings");
  const adminCount = countAdminUsersInStateForm(value);
  const issueCount = countFieldErrorMessages(fieldErrors);

  return (
    <FocusedTaskSurface
      title={i18n("walletSettings")}
      description={i18n("editRecoveryContactsProofOfLifeAndApprovals")}
      icon={Settings2}
      tasks={tasks}
      selectedTask={selectedTask}
      onSelectTask={onSelectTask}
      badgeByTask={{
        "settings-people": formatCountLabel(value.users.length, "person"),
        "settings-wallet-name": normalizeWalletName(value.walletName),
        "settings-proof-of-life": i18n("value1Value2", {
          value1: formatCountLabel(value.beneficiaries.length, "recoveryContact"),
          value2:
            value.proofOfLifeUnlockTimeMode === "some" &&
            value.proofOfLifeIncrementMode === "some"
              ? i18n("configured")
              : i18n("unset")
        }),
        "settings-multisig-threshold":
          value.multiSigThresholdMode === "some" ? i18n("enabled") : i18n("disabled")
      }}
      issueCount={issueCount}
    >
      <ZeroAdminConfirmationCallout
        adminCount={adminCount}
        zeroAdminConfirmed={zeroAdminConfirmed}
        onZeroAdminConfirmedChange={onZeroAdminConfirmedChange}
      />
      {selectedTask === "settings-people" ? (
        // The People page, merged in as the first tab: one update-state form was
        // reachable through two sidebar entries, and "who can act" is answered
        // on the same surface as the rules it feeds.
        <FocusedPeopleEditor
          value={value}
          onChange={onChange}
          fieldErrors={fieldErrors}
          zeroAdminConfirmed={zeroAdminConfirmed}
          onZeroAdminConfirmedChange={onZeroAdminConfirmedChange}
        />
      ) : null}
      {selectedTask === "settings-wallet-name" ? (
        <WalletNameEditor
          value={value.walletName}
          onChange={(walletName) => onChange({ ...value, walletName })}
          editable={walletNameEditable}
          compact
        />
      ) : null}
      {selectedTask === "settings-proof-of-life" ? (
        <>
          {/* The tab went straight into the fields with no word about what the timer is
              for. It is the only thing that lets a recovery contact ever act. */}
          <p className="text-sm text-muted-foreground">
            {i18n("theProofOfLifeIsHowLongYou")}
          </p>
          <ProofOfLifeSettingsEditor label={i18n("walletSettings")} value={value} onChange={onChange} />
          {/* The timer names recovery contacts in every helper, yet the tab showed
              neither them nor a way to add one. Listed underneath, the two halves of
              the arrangement sit on one tab. */}
          <RecoveryContactsSection value={value} onChange={onChange} />
        </>
      ) : null}
      {selectedTask === "settings-multisig-threshold" ? (
        <>
          {/* Like the timer tab, this one opened straight onto two boxes with no word
              about what they do or who they affect. */}
          <p className="text-sm text-muted-foreground">
            {i18n("letSeveralPeopleActTogetherOnThisWallet")}
          </p>
          <MultisigThresholdEditor value={value} onChange={onChange} />
        </>
      ) : null}
    </FocusedTaskSurface>
  );
}
