"use client";

import { useId } from "react";

import { GuidedDateTimeField, GuidedDurationField } from "./guided-fields";
import { BeneficiaryEditor, MultisigThresholdEditor } from "./people-editors";
import { FocusedTaskSurface, TaskEmptyState, ZeroAdminConfirmationCallout } from "./task-surface";
import { WalletNameEditor } from "./wallet-settings-editors";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { type FieldErrors, type UserWorkspaceTask } from "@/components/user/flow-types";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/guided-admin-catalog";
import { countFieldErrorMessages, formatCountLabel } from "@/components/user/workspace/helpers";
import { withSafetyTimerDefaults } from "@/components/user/workspace/helpers/form-state";
import { type StateFormState, countAdminUsersInStateForm, createDefaultBeneficiaryFormState, nextGeneratedId } from "@/lib/contracts/state-form";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
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
  const uid = useId();
  // One control, not two. The contract requires the deadline and the check-in length to be
  // set together: `expect_valid_settings`
  // (`smart-contract/lib/state/proof_of_life.ak:31-40`) rejects a pair where exactly one is
  // present. The screen offered a separate None/Some select for each, so a reader could
  // build a wallet the validator will not accept and only find out at the receipt.
  // `withSafetyTimerDefaults` is the same helper the full state editor already uses, and it
  // fills both fields with working values instead of leaving two empty boxes.
  const timerEnabled =
    value.proofOfLifeUnlockTimeMode === "some" || value.proofOfLifeIncrementMode === "some";
  const idPrefix = label.replace(/\s+/g, "-").toLowerCase();

  return (
    <div className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="space-y-1">
        <Label htmlFor={`${uid}-timer-enabled`}>Use a wake-up timer</Label>
        <Select
          id={`${uid}-timer-enabled`}
          value={timerEnabled ? "some" : "none"}
          onChange={(event) =>
            onChange(
              event.target.value === "some"
                ? withSafetyTimerDefaults(value)
                : {
                    ...value,
                    proofOfLifeUnlockTimeMode: "none",
                    proofOfLifeIncrementMode: "none"
                  }
            )
          }
        >
          <option value="none">No</option>
          <option value="some">Yes</option>
        </Select>
        <p className="text-xs text-muted-foreground">
          {timerEnabled
            ? "Check in before the date below to push it back. Miss it, and your recovery contacts can claim what is in this wallet."
            : "Turn this on so your recovery contacts can claim this wallet if you stop checking in. Without it, they can never act."}
        </p>
      </div>
      {timerEnabled ? (
        <div className="grid gap-3 md:grid-cols-2">
          <GuidedDateTimeField
            idPrefix={`${idPrefix}-wake-up-timer-unlock`}
            label="Recovery contacts can claim after"
            value={value.proofOfLifeUnlockTime}
            onChange={(proofOfLifeUnlockTime) => onChange({ ...value, proofOfLifeUnlockTime })}
            helper="Until this time, only the owners can use this wallet."
          />
          {/* `increment` is a cap on one check-in, not a period: a renewal must satisfy
              `updated_unlock_time <= tx_earliest_time + increment`
              (`proof_of_life.ak:124`). The old helper described the widget instead
              ("Use a human-sized interval instead of typing milliseconds."). */}
          <GuidedDurationField
            idPrefix={`${idPrefix}-wake-up-timer-increment`}
            label="Time each check-in buys"
            value={value.proofOfLifeIncrement}
            onChange={(proofOfLifeIncrement) => onChange({ ...value, proofOfLifeIncrement })}
            helper="Checking in moves the date beside this to that far from now, and no further."
          />
        </div>
      ) : null}
    </div>
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
  const tasks = GUIDED_ADMIN_TASKS.filter((task) => task.group === "wallet-settings");
  const adminCount = countAdminUsersInStateForm(value);
  const issueCount = countFieldErrorMessages(fieldErrors);

  return (
    <FocusedTaskSurface
      title="Wallet settings"
      description="Edit recovery contacts, wake-up timer, and approvals."
      icon={Settings2}
      tasks={tasks}
      selectedTask={selectedTask}
      onSelectTask={onSelectTask}
      badgeByTask={{
        "settings-wallet-name": normalizeWalletName(value.walletName),
        "settings-beneficiaries": formatCountLabel(
          value.beneficiaries.length,
          "person",
          "people"
        ),
        "settings-proof-of-life":
          value.proofOfLifeUnlockTimeMode === "some" ? "Configured" : "Unset",
        "settings-multisig-threshold":
          value.multiSigThresholdMode === "some" ? "Enabled" : "Disabled"
      }}
      issueCount={issueCount}
    >
      <ZeroAdminConfirmationCallout
        adminCount={adminCount}
        zeroAdminConfirmed={zeroAdminConfirmed}
        onZeroAdminConfirmedChange={onZeroAdminConfirmedChange}
      />
      {selectedTask === "settings-wallet-name" ? (
        <WalletNameEditor
          value={value.walletName}
          onChange={(walletName) => onChange({ ...value, walletName })}
          editable={walletNameEditable}
          compact
        />
      ) : null}
      {selectedTask === "settings-beneficiaries" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* "Edit your recovery contacts here." described the form and never said what
                a recovery contact is for or when one may act. Both gates matter:
                `smart-contract/lib/state/types.ak:39-41` requires the wallet's
                proof-of-life window AND the contact's own `unlock_after` to have passed. */}
            <p className="text-sm text-muted-foreground">
              If you stop checking in and the wake-up timer runs out, these people can each
              claim a share of what is in this wallet.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                onChange({
                  ...value,
                  beneficiaries: [
                    ...value.beneficiaries,
                    createDefaultBeneficiaryFormState(nextGeneratedId(value.beneficiaries))
                  ]
                })
              }
            >
              <Plus className="h-4 w-4" />
              Add recovery contact
            </Button>
          </div>
          {value.beneficiaries.length === 0 ? (
            <TaskEmptyState
              icon={HandHeart}
              title="Nobody can recover this wallet"
              // Kept under LONG_DESCRIPTION_LIMIT (78) so `TaskEmptyState` renders it as
              // visible text rather than folding it into an InfoHint.
              description="Add someone who can claim what is here if the wake-up timer runs out."
              actionLabel="Add recovery contact"
              onAction={() =>
                onChange({
                  ...value,
                  beneficiaries: [
                    ...value.beneficiaries,
                    createDefaultBeneficiaryFormState(nextGeneratedId(value.beneficiaries))
                  ]
                })
              }
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
      ) : null}
      {selectedTask === "settings-proof-of-life" ? (
        <>
          {/* The tab went straight into the fields with no word about what the timer is
              for. It is the only thing that lets a recovery contact ever act. */}
          <p className="text-sm text-muted-foreground">
            The wake-up timer is how long you have between check-ins. Let it run out and
            your recovery contacts can claim what is in this wallet.
          </p>
          <ProofOfLifeSettingsEditor label="Wallet settings" value={value} onChange={onChange} />
        </>
      ) : null}
      {selectedTask === "settings-multisig-threshold" ? (
        <>
          {/* Like the timer tab, this one opened straight onto two boxes with no word
              about what they do or who they affect. */}
          <p className="text-sm text-muted-foreground">
            Let several people act together on this wallet, even when none of them is an
            owner. An owner can still act alone either way.
          </p>
          <MultisigThresholdEditor value={value} onChange={onChange} />
        </>
      ) : null}
    </FocusedTaskSurface>
  );
}
