"use client";

import { GuidedDateTimeField, GuidedDurationField } from "./guided-fields";
import { BeneficiaryEditor, MultisigThresholdEditor } from "./people-editors";
import { FocusedTaskSurface, TaskEmptyState, ZeroAdminConfirmationCallout } from "./task-surface";
import { WalletNameEditor } from "./wallet-settings-editors";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type FieldErrors, type UserWorkspaceTask } from "@/components/user/flow-types";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/constants";
import { countFieldErrorMessages, formatCountLabel } from "@/components/user/workspace/helpers";
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
  return (
    <div className="user-surface user-list-item space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Wake-up timer Increment Mode</Label>
          <select
            value={value.proofOfLifeIncrementMode}
            onChange={(event) =>
              onChange({
                ...value,
                proofOfLifeIncrementMode: event.target.value as "none" | "some"
              })
            }
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="none">None</option>
            <option value="some">Some</option>
          </select>
        </div>
        <GuidedDurationField
          idPrefix={`${label.replace(/\s+/g, "-").toLowerCase()}-wake-up timer-increment`}
          label="Wake-up timer Increment"
          value={value.proofOfLifeIncrement}
          onChange={(proofOfLifeIncrement) => onChange({ ...value, proofOfLifeIncrement })}
          disabled={value.proofOfLifeIncrementMode === "none"}
          helper="Use a human-sized interval instead of typing milliseconds."
        />
        <div className="space-y-1.5">
          <Label>Wake-up timer Unlock Time Mode</Label>
          <select
            value={value.proofOfLifeUnlockTimeMode}
            onChange={(event) =>
              onChange({
                ...value,
                proofOfLifeUnlockTimeMode: event.target.value as "none" | "some"
              })
            }
            className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="none">None</option>
            <option value="some">Some</option>
          </select>
        </div>
      </div>
      <GuidedDateTimeField
        idPrefix={`${label.replace(/\s+/g, "-").toLowerCase()}-wake-up timer-unlock`}
        label="Wake-up timer Unlock Time"
        value={value.proofOfLifeUnlockTime}
        onChange={(proofOfLifeUnlockTime) => onChange({ ...value, proofOfLifeUnlockTime })}
        disabled={value.proofOfLifeUnlockTimeMode === "none"}
        helper="Choose the local date and time when the wake-up timer gate unlocks."
      />
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
      stats={
        <>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Name
            </p>
            <p className="mt-1 truncate text-sm font-medium text-foreground">
              {normalizeWalletName(value.walletName)}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Recovery contacts
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {value.beneficiaries.length}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Proof of live
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {value.proofOfLifeUnlockTimeMode === "some" ? "Configured" : "Unset"}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Multisig</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {value.multiSigThresholdMode === "some"
                ? value.multiSigThreshold || "0"
                : "Disabled"}
            </p>
          </div>
        </>
      }
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
            <p className="text-sm text-muted-foreground">
              Edit your recovery contacts here.
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
              title="No recovery contacts yet"
              description="Add your first recovery contact."
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
        <ProofOfLifeSettingsEditor label="Wallet settings" value={value} onChange={onChange} />
      ) : null}
      {selectedTask === "settings-multisig-threshold" ? (
        <MultisigThresholdEditor value={value} onChange={onChange} />
      ) : null}
    </FocusedTaskSurface>
  );
}
