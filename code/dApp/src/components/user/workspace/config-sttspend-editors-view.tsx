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

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ProofOfLifeOverrideMode
} from "@/lib/contracts/state-form";

import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { DisclosureSection, GuidedDateTimeField, GuidedLockedUtxoSelector, InlineFieldError, WalletInputRefsEditor } from "@/components/user/workspace/editors";
import { formatAmountSummary, formatTimestampLabel, formatTransferControlId, getFirstFieldError } from "@/components/user/workspace/helpers";

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
              title="Advanced: locked fund pools"
              description={
                isGuidedStreamingPaymentAction
                  ? "Pick the exact wallet funding entries for streaming payment payouts, or use suggested entries after you choose payouts."
                  : "Pick the exact wallet funding entries for this send, or use suggested entries after you set recipient and amount. Collapsed by default."
              }
              defaultOpen={sttWalletInputs.length > 0}
            >
              <GuidedLockedUtxoSelector
                utxos={lockedContractUtxos}
                selectedRefs={sttWalletInputs}
                onChange={setSttWalletInputs}
                onSuggest={applySuggestedLockedInputs}
                helper={
                  isGuidedStreamingPaymentAction
                    ? "The app can suggest the smallest available set of fund pools that covers the selected streaming payment payouts."
                    : "The app can suggest fund pools after you choose the recipient and amount."
                }
              />
            </DisclosureSection>
          ) : activeSttActionTab.showLockedContractUtxoBrowser ? (
            <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-4">
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
                            Add ref
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
            <>
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
              <InlineFieldError
                message={
                  getFirstFieldError(activeFieldErrors, "Locked contract inputs") ??
                  getFirstFieldError(activeFieldErrors, "Wallet script UTxOs")
                }
              />
            </>
          ) : (
            <InlineFieldError
              message={
                getFirstFieldError(activeFieldErrors, "Locked contract inputs") ??
                getFirstFieldError(activeFieldErrors, "Wallet script UTxOs")
              }
            />
          )}

          {activeSttActionTab.showTransfers &&
          activeSttActionTab.showQuickTransferBuilder &&
          selectedAction !== "update-state" &&
          selectedAction !== "manage-streaming-payments" &&
          !isRecipientFirstGuidedAction &&
          !isGuidedStreamingPaymentAction ? (
            <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-4">
              <div className="space-y-1">
                <Label>Quick transfer builder</Label>
                <p className="text-xs text-muted-foreground">
                  {activeSttActionTab.transferSelectorHelper}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-1.5">
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
                        <div className="space-y-1.5">
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
                        <div className="space-y-1.5">
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
                  No locked-input assets available for sliders yet. Add locked contract input refs
                  first.
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
              description={
                selectedAction === "renew-proof-of-life"
                  ? "Renew Wake-up timer usually works with Auto. Open this only when you intentionally want to clear the timer or pin a specific local date and time."
                  : "Most withdrawals can leave this on Auto. Open it only when you intentionally want to keep the wake-up timer unchanged or pin a specific local date and time."
              }
            >
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="userSttProofOfLifeOverrideMode">Wake-up timer Update</Label>
                  <select
                    id="userSttProofOfLifeOverrideMode"
                    value={sttProofOfLifeOverrideMode}
                    onChange={(event) =>
                      setSttProofOfLifeOverrideMode(
                        event.target.value as ProofOfLifeOverrideMode
                      )
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="auto">Auto: use the allowed renewal window</option>
                    <option value="none">Clear wake-up timer</option>
                    <option value="specific">Pick a specific local date and time</option>
                  </select>
                </div>
                {sttProofOfLifeOverrideMode === "specific" ? (
                  <GuidedDateTimeField
                    idPrefix="user-stt-wake-up timer-specific"
                    label="Specific safety date"
                    value={sttProofOfLifeSpecificDateTime}
                    onChange={setSttProofOfLifeSpecificDateTime}
                    helper="The app will store the matching on-chain timestamp."
                  />
                ) : null}
                <InlineFieldError
                  message={getFirstFieldError(activeFieldErrors, "Specific wake-up timer date")}
                />
                <p className="text-xs text-muted-foreground">
                  Applied when preparing{" "}
                  {selectedAction === "renew-proof-of-life"
                    ? "Refresh wake-up timer"
                    : "Send funds"}
                  . The wallet rules will use the exact wake-up timer shown here.
                </p>
                <p className="text-xs text-muted-foreground">
                  {sttProofOfLifeIncrement === undefined
                    ? "Current safety window could not be read."
                    : sttProofOfLifeIncrement === null
                      ? "This wallet has no safety window, so Auto leaves the timer unset."
                      : `Current safety window: ${sttProofOfLifeIncrement}. Auto keeps the current unlock time or moves it forward by that window, whichever is later.`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sttProofOfLifeUnlockTime === undefined
                    ? "Current safety unlock time could not be read."
                    : sttProofOfLifeUnlockTime === null
                      ? "Current safety unlock time: none"
                      : `Current safety unlock time: ${formatTimestampLabel(sttProofOfLifeUnlockTime)}`}
                </p>
              </div>
            </DisclosureSection>
          ) : null}
    </>
  );
}
