"use client";
import { availableLockedTransferAssetsAtom } from "@/components/user/workspace/atoms/workspace-transfer-derivations.atoms";
import { selectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { activeSttActionTabAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { lockingContractAtom, sttProofOfLifeIncrementAtom, sttProofOfLifeUnlockTimeAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { lockedContractUtxosAtom, lockedContractUtxosErrorAtom, lockedContractUtxosLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useAtomValue } from "jotai";

import {
  Loader2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ProofOfLifeOverrideMode
} from "@/lib/contracts/state-form";

import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { DisclosureSection, GuidedDateTimeField, GuidedLockedUtxoSelector, InlineFieldError, WalletInputRefsEditor } from "@/components/user/workspace/editors";
import { formatAmountSummary, formatDurationMillisLabel, formatTimestampLabel, formatTransferControlId, getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useConsolidateForm } from "@/components/user/workspace/forms/use-consolidate-form";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";

export function SttSpendEditorsView() {
  const state = useWorkspaceActions();
  const availableLockedTransferAssets = useAtomValue(availableLockedTransferAssetsAtom);
  const activeSttActionTab = useAtomValue(activeSttActionTabAtom);
  const lockingContract = useAtomValue(lockingContractAtom);
  const selectedAction = useAtomValue(selectedActionAtom);
  const sttProofOfLifeIncrement = useAtomValue(sttProofOfLifeIncrementAtom);
  const sttProofOfLifeUnlockTime = useAtomValue(sttProofOfLifeUnlockTimeAtom);
  const lockedContractUtxos = useAtomValue(lockedContractUtxosAtom);
  const lockedContractUtxosLoading = useAtomValue(lockedContractUtxosLoadingAtom);
  const lockedContractUtxosError = useAtomValue(lockedContractUtxosErrorAtom);
  const {
    activeFieldErrors,
    addLockedContractInputRef,
    addSttTransferRecipient,
    applySuggestedLockedInputs,
    refreshLockedContractUtxos,
    updateSttTransferAmount
  } = state;
  const { consolidateWalletInputs, setConsolidateWalletInputs } = useConsolidateForm();
  const { setSttProofOfLifeOverrideMode, setSttProofOfLifeSpecificDateTime, setSttTransferAddress, setSttWalletInputs, sttProofOfLifeOverrideMode, sttProofOfLifeSpecificDateTime, sttTransferAddress, sttTransferAmounts, sttWalletInputs } = useSttSpendForm();
  const isRecipientFirstGuidedAction =
    selectedAction === "use" ||
    selectedAction === "use-allowance" ||
    selectedAction === "use-beneficiary";
  const isGuidedStreamingPaymentAction = selectedAction === "payout-streaming-payment";
  const usesGuidedLockedInputSelector =
    isRecipientFirstGuidedAction || isGuidedStreamingPaymentAction;
  const currentWalletInputs =
    selectedAction === "consolidate-utxo" ? consolidateWalletInputs : sttWalletInputs;

  return (
    <>
          {usesGuidedLockedInputSelector ? (
            <DisclosureSection
              /* "Advanced fund options", not "Advanced: locked fund pools": the other three
                 disclosures in the app name themselves with a plain adjective ("Advanced
                 wallet details", "Advanced options", "Advanced person details"), and "locked"
                 was a fifth word for a distinction the rest of the app does not draw. */
              title="Advanced fund options"
              description={
                isGuidedStreamingPaymentAction
                  ? "Optional. Leave it empty and the payment comes from your own connected wallet."
                  : // Not "the app can suggest them": `use-workspace-send-action-effects.ts:36-49`
                    // selects the fund pools for you the moment a payout is staged, so the reader
                    // who opened this expecting an empty list found it already filled in.
                    "The app already picks which funds to spend. Open this only to choose them yourself."
              }
              defaultOpen={sttWalletInputs.length > 0}
            >
              <GuidedLockedUtxoSelector
                utxos={lockedContractUtxos}
                selectedRefs={sttWalletInputs}
                onChange={setSttWalletInputs}
                onSuggest={applySuggestedLockedInputs}
                /* The panel helper is read with the section open, the description with it
                   closed. Both used to state the same fact, so opening the section repeated
                   the sentence that made you open it. The helper now says what to do here. */
                helper={
                  isGuidedStreamingPaymentAction
                    ? "Select the shared wallet's funds you want to pay from."
                    : "Selected for you once you add a payout. Change the selection here if you want different funds."
                }
              />
            </DisclosureSection>
          ) : activeSttActionTab.showLockedContractUtxoBrowser ? (
            <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label>{activeSttActionTab.lockedInputsLabel}</Label>
                  <p className="text-xs text-muted-foreground">
                    {activeSttActionTab.lockedInputsHelper}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void refreshLockedContractUtxos(lockingContract.address)}
                  disabled={!lockingContract.address || lockedContractUtxosLoading}
                >
                  {lockedContractUtxosLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Refresh funds
                </Button>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                {lockingContract.address ? (
                  <p className="break-all font-mono text-xs">{lockingContract.address}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{lockingContract.error}</p>
                )}
              </div>
              {lockedContractUtxosError ? (
                <p className="text-xs text-rose-300">{lockedContractUtxosError}</p>
              ) : null}
              {lockingContract.address ? (
                lockedContractUtxos.length > 0 ? (
                  <div className="max-h-56 space-y-2 overflow-auto rounded-lg border border-border/60 bg-background/20 p-2">
                    {lockedContractUtxos.map((utxo) => (
                      <div
                        key={`${utxo.input.txHash}#${utxo.input.outputIndex}`}
                        className="flex w-full flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="break-all font-mono text-xs">
                            {utxo.input.txHash}#{utxo.input.outputIndex}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatAmountSummary(utxo.output.amount)}
                          </p>
                        </div>
                        <div className="ml-auto shrink-0">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => addLockedContractInputRef(utxo)}
                          >
                            Add fund pool
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : lockedContractUtxosLoading ? null : (
                  <p className="text-xs text-muted-foreground">
                    No spendable wallet funds found right now.
                  </p>
                )
              ) : null}
            </div>
          ) : null}

          {!usesGuidedLockedInputSelector ? (
            <WalletInputRefsEditor
              label={activeSttActionTab.lockedInputsEditorLabel}
              helper={activeSttActionTab.lockedInputsEditorHelper}
              value={currentWalletInputs}
              onChange={
                selectedAction === "consolidate-utxo"
                  ? setConsolidateWalletInputs
                  : setSttWalletInputs
              }
            />
          ) : null}
          {/* One error node, not one per branch: both arms of the old ternary rendered the
              same element with the same props. */}
          <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Fund pools")} />

          {activeSttActionTab.showTransfers &&
          activeSttActionTab.showQuickTransferBuilder &&
          selectedAction !== "update-state" &&
          selectedAction !== "manage-streaming-payments" &&
          !isRecipientFirstGuidedAction &&
          !isGuidedStreamingPaymentAction ? (
            <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
              <div className="space-y-1">
                <Label>Quick transfer builder</Label>
                <p className="text-xs text-muted-foreground">
                  {activeSttActionTab.transferSelectorHelper}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-1">
                  <Label htmlFor="userSttTransferAddress">Send To Address</Label>
                  <Input
                    id="userSttTransferAddress"
                    value={sttTransferAddress}
                    onChange={(event) => setSttTransferAddress(event.target.value)}
                    placeholder="addr_test..."
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={addSttTransferRecipient}
                    disabled={availableLockedTransferAssets.length === 0}
                  >
                    Add recipient
                  </Button>
                </div>
              </div>
              {availableLockedTransferAssets.length > 0 ? (
                <div className="space-y-3">
                  {availableLockedTransferAssets.map((asset) => {
                    const controlId = formatTransferControlId(asset.unit);
                    const currentValue = sttTransferAmounts[asset.unit] ?? asset.quantity;

                    return (
                      <div
                        key={asset.unit}
                        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor={`userSttTransferAmountRange-${controlId}`}>
                              Send amount ({resolveAssetIdentity(asset.unit).symbol})
                            </Label>
                            <span className="text-xs text-muted-foreground">
                              {currentValue} / {asset.quantity}
                            </span>
                          </div>
                          <input
                            id={`userSttTransferAmountRange-${controlId}`}
                            type="range"
                            min="0"
                            max={asset.quantity}
                            step="1"
                            value={currentValue}
                            onChange={(event) =>
                              updateSttTransferAmount(asset.unit, event.target.value, asset.quantity)
                            }
                            className="h-10 w-full cursor-pointer accent-primary"
                          />
                          <p className="text-xs text-muted-foreground">
                            Available from chosen fund pools: {asset.quantity}{" "}
                            {resolveAssetIdentity(asset.unit).symbol}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`userSttTransferAmountInput-${controlId}`}>
                            Exact Amount
                          </Label>
                          <Input
                            id={`userSttTransferAmountInput-${controlId}`}
                            type="number"
                            min="0"
                            max={asset.quantity}
                            step="1"
                            value={currentValue}
                            onChange={(event) =>
                              updateSttTransferAmount(asset.unit, event.target.value, asset.quantity)
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No assets to split yet. Add a fund pool first.
                </p>
              )}
              <InlineFieldError
                message={getFirstFieldError(activeFieldErrors, "Transfers / forwarded outputs")}
              />
            </div>
          ) : null}

          {activeSttActionTab.showProofOfLifeOverride ? (
            <DisclosureSection
              title="Wake-up timer"
              /* The old pair named a control that does not exist ("Renew Wake-up timer";
                 the tab is "Refresh wake-up timer") and offered a choice that does not
                 exist ("keep the wake-up timer unchanged"; the three options are Auto,
                 clear, and an exact date). Both now describe the options actually below. */
              description={
                selectedAction === "renew-proof-of-life"
                  ? "Auto suits most check-ins. Open this only to clear the timer or set an exact date and time."
                  : "Auto suits most sends. Open this only to clear the timer or set an exact date and time."
              }
            >
              {/* No border, background, or padding of its own. `DisclosureSection` is already
                  a `rounded-lg` bordered panel with `px-4`, so this drew a second box at the
                  identical radius inside the first and pushed the gutter to 28px. */}
              <div className="space-y-3">
                <div className="space-y-1">
                  {/* Not "Wake-up timer Update": the section heading directly above already
                      says "Wake-up timer", so the label only had to say what the choice does. */}
                  <Label htmlFor="userSttProofOfLifeOverrideMode">What happens to the timer</Label>
                  <Select
                    id="userSttProofOfLifeOverrideMode"
                    value={sttProofOfLifeOverrideMode}
                    onChange={(event) =>
                      setSttProofOfLifeOverrideMode(
                        event.target.value as ProofOfLifeOverrideMode
                      )
                    }
                  >
                    {/* "the allowed renewal window" named a rule the reader cannot look up.
                        What Auto does is spelled out in the sentence below the control. */}
                    <option value="auto">Auto (recommended)</option>
                    <option value="none">Clear the wake-up timer</option>
                    <option value="specific">Choose a date and time</option>
                  </Select>
                </div>
                {sttProofOfLifeOverrideMode === "specific" ? (
                  <GuidedDateTimeField
                    idPrefix="user-stt-wake-up-timer-specific"
                    label="Specific wake-up timer date"
                    value={sttProofOfLifeSpecificDateTime}
                    onChange={setSttProofOfLifeSpecificDateTime}
                    /* The field already prints "Saved as <local date and time>." underneath,
                       so restating that it gets stored told the reader nothing. What the date
                       means is the part they cannot work out ("Recovery can start after",
                       `editors/state-form-editor.tsx:375`). */
                    helper="Recovery cannot start before this moment."
                  />
                ) : null}
                <InlineFieldError
                  message={getFirstFieldError(activeFieldErrors, "Specific wake-up timer date")}
                />
                {/* Deadline first: it is the fact the reader came for. The third paragraph
                    this block used to open with ("Applied when preparing Send funds…") only
                    restated that a control inside the send form affects the send. */}
                <p className="text-xs text-muted-foreground">
                  {sttProofOfLifeUnlockTime === undefined
                    ? "The current wake-up timer deadline could not be read."
                    : sttProofOfLifeUnlockTime === null
                      ? "No wake-up timer is set on this wallet right now."
                      : `Recovery can start after ${formatTimestampLabel(sttProofOfLifeUnlockTime)}.`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sttProofOfLifeIncrement === undefined
                    ? "The current wake-up timer extension could not be read."
                    : sttProofOfLifeIncrement === null
                      ? "This wallet sets no wake-up timer extension, so Auto leaves the timer unset."
                      : // Not the raw number: the datum stores milliseconds, so the default
                        // 30-day timer read as "extends the wake-up timer by 2592000000".
                        `Each check-in extends it by ${formatDurationMillisLabel(sttProofOfLifeIncrement)}. Auto keeps the current deadline or moves it forward by that much, whichever is later.`}
                </p>
              </div>
            </DisclosureSection>
          ) : null}
    </>
  );
}
