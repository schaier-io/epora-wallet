"use client";
import { availableLockedTransferAssetOptionsAtom, availableLockedTransferAssetsAtom, selectedTransferAssetAtom, streamingPaymentPayoutRowsAtom, streamingPaymentPayoutTransfersAtom } from "@/components/user/workspace/atoms/workspace-transfer-derivations.atoms";
import { recentRecipientsAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { effectiveWalletAssetNameHexAtom, selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { resolvedSelectedTaskAtom, selectedActionAtom, selectedIntentAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { activeSttActionTabAtom, activeSttAuthorityOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { useAllowancePreviewAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";

import {
  Repeat
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  formatLovelaceAsAda,
  parseAdaToLovelace } from "@/lib/user-flow/guided-helpers";
import {
  type AuthorityPath,
  type ConsolidateAuthorityPath } from "@/lib/types/contracts";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/constants";
import { FocusedPeopleEditor, FocusedStreamingPaymentRulesEditor, FocusedTaskSurface, FocusedWalletSettingsEditor, InlineFieldError, SearchableAssetUnitDropdown, StateFormEditor } from "@/components/user/workspace/editors";
import { countFieldErrorMessages, formatAmountSummary, formatTimestampLabel, getFirstFieldError, shortenAddress } from "@/components/user/workspace/helpers";

import { useAtomValue } from "jotai";
import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";
import { useTransferForm } from "@/components/user/workspace/forms/use-transfer-form";
import { SttSpendEditorsView } from "@/components/user/workspace/config-sttspend-editors-view";

export function SttSpendConfigView() {
  const state = useWorkspaceActions();
  const availableLockedTransferAssets = useAtomValue(availableLockedTransferAssetsAtom);
  const availableLockedTransferAssetOptions = useAtomValue(availableLockedTransferAssetOptionsAtom);
  const selectedTransferAsset = useAtomValue(selectedTransferAssetAtom);
  const streamingPaymentPayoutRows = useAtomValue(streamingPaymentPayoutRowsAtom);
  const streamingPaymentPayoutTransfers = useAtomValue(streamingPaymentPayoutTransfersAtom);
  const recentRecipients = useAtomValue(recentRecipientsAtom);
  const activeAddress = useAtomValue(activeAddressAtom);
  const activePaymentKeyHash = useAtomValue(activePaymentKeyHashAtom);
  const activeSttActionTab = useAtomValue(activeSttActionTabAtom);
  const activeSttAuthorityOptions = useAtomValue(activeSttAuthorityOptionsAtom);
  const effectiveWalletAssetNameHex = useAtomValue(effectiveWalletAssetNameHexAtom);
  const resolvedSelectedTask = useAtomValue(resolvedSelectedTaskAtom);
  const selectedAction = useAtomValue(selectedActionAtom);
  const selectedDetectedToken = useAtomValue(selectedDetectedTokenAtom);
  const selectedIntent = useAtomValue(selectedIntentAtom);
  const useAllowancePreview = useAtomValue(useAllowancePreviewAtom);
  const config = useAtomValue(configAtom);
  const {
    activeFieldErrors,
    addSimpleTransferRecipient,
    flowAvailability,
    guidedStreamingPaymentTaskBadges,
    guidedStreamingPaymentsDisabledTasks,
    handleFocusedTaskSelect
  } = state;
  const { consolidateAuthorityPath, setConsolidateAuthorityPath, setStreamingPaymentPayoutAmounts, setSttAuthorityPath, setSttExtraTransfers, setSttStateForm, setSttZeroAdminConfirmed, sttAuthorityPath, sttExtraTransfers, sttStateForm, sttWalletInputs, sttZeroAdminConfirmed } = useSttSpendForm();
  const { setTransferCustomAddress, setTransferDisplayAmount, setTransferRecipientMode, setTransferSelectedUnit, transferCustomAddress, transferDisplayAmount, transferRecipientMode, transferSelectedUnit } = useTransferForm();

      const isRecipientFirstGuidedAction =
        selectedAction === "use" ||
        selectedAction === "use-allowance" ||
        selectedAction === "use-beneficiary";
      const isGuidedStreamingPaymentAction = selectedAction === "payout-streaming-payment";
      const usesFocusedPeopleEditor =
        selectedAction === "update-state" && selectedIntent === "manage-people";
      const usesFocusedWalletSettingsEditor =
        selectedAction === "update-state" && selectedIntent === "wallet-settings";
      const usesFocusedStreamingPaymentRulesEditor = selectedAction === "manage-streaming-payments";

      return (
        <div className="space-y-5">
          <div className="rounded-xl border border-border/60 bg-background/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{activeSttActionTab.label}</Badge>
              <Badge variant={selectedDetectedToken ? "secondary" : "warning"}>
                {selectedDetectedToken
                  ? "This wallet"
                  : "Select a smart wallet first"}
              </Badge>
              {activeSttAuthorityOptions.length > 1 ? (
                <>
                  <Label htmlFor="sttAuthorityPath" className="sr-only">
                    Authorization path
                  </Label>
                  <select
                    id="sttAuthorityPath"
                    className="h-8 min-w-[10rem] rounded-md border border-input bg-background px-2 text-xs"
                    value={
                      selectedAction === "consolidate-utxo"
                        ? consolidateAuthorityPath
                        : sttAuthorityPath
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value as AuthorityPath;
                      if (selectedAction === "consolidate-utxo") {
                        setConsolidateAuthorityPath(nextValue as ConsolidateAuthorityPath);
                        return;
                      }

                      setSttAuthorityPath(nextValue);
                    }}
                  >
                    {activeSttAuthorityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : activeSttAuthorityOptions[0] ? (
                <Badge variant="outline" className="font-normal">
                  {activeSttAuthorityOptions[0].label}
                </Badge>
              ) : null}
            </div>
          </div>

          {activeSttActionTab.allowsStateEditing ? (
            <>
              {usesFocusedPeopleEditor ? (
                <FocusedPeopleEditor
                  value={sttStateForm}
                  onChange={(nextState) => {
                    setSttStateForm(nextState);
                    setSttZeroAdminConfirmed(false);
                  }}
                  selectedTask={resolvedSelectedTask}
                  onSelectTask={handleFocusedTaskSelect}
                  fieldErrors={activeFieldErrors}
                  zeroAdminConfirmed={sttZeroAdminConfirmed}
                  onZeroAdminConfirmedChange={setSttZeroAdminConfirmed}
                />
              ) : usesFocusedWalletSettingsEditor ? (
                <FocusedWalletSettingsEditor
                  value={sttStateForm}
                  onChange={(nextState) => {
                    setSttStateForm(nextState);
                    setSttZeroAdminConfirmed(false);
                  }}
                  selectedTask={resolvedSelectedTask}
                  onSelectTask={handleFocusedTaskSelect}
                  fieldErrors={activeFieldErrors}
                  walletNameEditable={sttAuthorityPath === "admin"}
                  zeroAdminConfirmed={sttZeroAdminConfirmed}
                  onZeroAdminConfirmedChange={setSttZeroAdminConfirmed}
                />
              ) : usesFocusedStreamingPaymentRulesEditor ? (
                <FocusedStreamingPaymentRulesEditor
                  value={sttStateForm}
                  onChange={(nextState) => {
                    setSttStateForm(nextState);
                    setSttZeroAdminConfirmed(false);
                  }}
                  selectedTask={resolvedSelectedTask}
                  onSelectTask={handleFocusedTaskSelect}
                  fieldErrors={activeFieldErrors}
                  canPayDue={flowAvailability.canPayStreamingPayments}
                />
              ) : (
                <StateFormEditor
                  label={activeSttActionTab.outputStateLabel}
                  helper={activeSttActionTab.stateHelper}
                  value={sttStateForm}
                  onChange={(nextState) => {
                    setSttStateForm(nextState);
                    setSttZeroAdminConfirmed(false);
                  }}
                  connectedPaymentKeyHash={activePaymentKeyHash}
                  sttPolicyId={config.walletPolicyId}
                  sttAssetNameHex={effectiveWalletAssetNameHex}
                  walletNameEditable={
                    selectedAction === "update-state" && sttAuthorityPath === "admin"
                  }
                  zeroAdminConfirmed={sttZeroAdminConfirmed}
                  onZeroAdminConfirmedChange={setSttZeroAdminConfirmed}
                />
              )}
              <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Output state")} />
              <InlineFieldError
                message={getFirstFieldError(activeFieldErrors, "Zero-admin confirmation")}
              />
            </>
          ) : null}

          {selectedAction === "use-allowance" ? (
            <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-4">
              <div className="space-y-1">
                <Label>Allowance target</Label>
                <p className="text-xs text-muted-foreground">
                  The connected payment key hash plus the requested spend must resolve to exactly one allowance user. This mode derives the next STT datum automatically instead of allowing manual state edits.
                </p>
              </div>
              {useAllowancePreview.error ? (
                <p className="text-xs text-rose-300">{useAllowancePreview.error}</p>
              ) : useAllowancePreview.target ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      Matched user: {useAllowancePreview.target.matchedUserId}
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      Wallets: {useAllowancePreview.target.matchedUserWallets.length}
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      Current remaining:{" "}
                      {formatAmountSummary(useAllowancePreview.target.currentRemainingAllowance)}
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      Next reset after spend:{" "}
                      {formatTimestampLabel(
                        useAllowancePreview.computation?.nextAllowanceReset ??
                          useAllowancePreview.target.nextAllowanceReset
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      Effective allowance now:{" "}
                      {formatAmountSummary(
                        useAllowancePreview.target.effectiveRemainingAllowance
                      )}
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      Requested spend:{" "}
                      {useAllowancePreview.computation
                        ? formatAmountSummary(useAllowancePreview.computation.spentAllowance)
                        : "Not derived yet"}
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      Remaining after spend:{" "}
                      {useAllowancePreview.computation
                        ? formatAmountSummary(
                            useAllowancePreview.computation.resultingRemainingAllowance
                          )
                        : "Not derived yet"}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {isRecipientFirstGuidedAction ? (
            <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-4">
              <div className="space-y-1">
                <Label>Send from this smart wallet</Label>
                <p className="text-xs text-muted-foreground">
                  Pick a recipient, enter an amount, add the payout, then choose which fund pools to
                  spend from (use Select suggested inputs for an automatic pick).
                </p>
              </div>
              <div className="max-w-sm space-y-1.5">
                <Label htmlFor="walletRecipientSelect">Recipient</Label>
                <select
                  id="walletRecipientSelect"
                  value={transferRecipientMode}
                  onChange={(event) => setTransferRecipientMode(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {activeAddress ? <option value="my-address">My address</option> : null}
                  {recentRecipients.map((entry) => (
                    <option key={`recent-${entry}`} value={`recent:${entry}`}>
                      {`Recent: ${shortenAddress(entry)}`}
                    </option>
                  ))}
                  <option value="custom">Custom address</option>
                </select>
              </div>
              {transferRecipientMode === "custom" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="walletRecipientCustom">Custom address</Label>
                  <Input
                    id="walletRecipientCustom"
                    value={transferCustomAddress}
                    onChange={(event) => setTransferCustomAddress(event.target.value)}
                    placeholder="addr_test..."
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Sending to{" "}
                  <span className="font-medium text-foreground">
                    {transferRecipientMode === "my-address"
                      ? shortenAddress(activeAddress)
                      : shortenAddress(transferRecipientMode.slice("recent:".length))}
                  </span>
                </div>
              )}
              {availableLockedTransferAssets.length > 0 ? (
                <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="walletTransferAmount">
                      {transferSelectedUnit === "lovelace" ? "How much (ADA)" : "How much"}
                    </Label>
                    <div className="relative">
                      <Input
                        id="walletTransferAmount"
                        type="text"
                        inputMode={transferSelectedUnit === "lovelace" ? "decimal" : "numeric"}
                        value={transferDisplayAmount}
                        onChange={(event) => setTransferDisplayAmount(event.target.value)}
                        placeholder={transferSelectedUnit === "lovelace" ? "0.00" : "0"}
                        className="pr-16"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2"
                        onClick={() =>
                          setTransferDisplayAmount(
                            selectedTransferAsset
                              ? selectedTransferAsset.unit === "lovelace"
                                ? formatLovelaceAsAda(selectedTransferAsset.quantity)
                                : selectedTransferAsset.quantity
                              : ""
                          )
                        }
                        disabled={!selectedTransferAsset}
                      >
                        Max
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="walletAssetSelect">Asset</Label>
                    <SearchableAssetUnitDropdown
                      id="walletAssetSelect"
                      value={transferSelectedUnit}
                      options={availableLockedTransferAssetOptions}
                      onChange={setTransferSelectedUnit}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={addSimpleTransferRecipient}
                      disabled={availableLockedTransferAssets.length === 0}
                    >
                      Add payout
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Load the locked funds first so the wallet can show available payout assets.
                </p>
              )}
              {availableLockedTransferAssets.length > 0 && sttExtraTransfers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Enter an amount and click <span className="font-medium text-foreground">Add payout</span> to include it in the transaction. The receipt updates only after a payout is added.
                </p>
              ) : null}
              {sttExtraTransfers.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Pending payouts
                  </p>
                  {sttExtraTransfers.map((transfer, index) => (
                    <div
                      key={`simple-transfer-${index}`}
                      className="flex w-full flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {shortenAddress(transfer.address)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatAmountSummary(transfer.amount)}
                        </p>
                      </div>
                      <div className="ml-auto shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setSttExtraTransfers((current) =>
                              current.filter((_, currentIndex) => currentIndex !== index)
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <InlineFieldError
                message={getFirstFieldError(activeFieldErrors, "Transfers / forwarded outputs")}
              />
            </div>
          ) : null}

          {isGuidedStreamingPaymentAction ? (
            <FocusedTaskSurface
              title="Streaming payments"
              description="Use the same grouped streaming payment surface for paying due items without leaving the guided workspace."
              icon={Repeat}
              tasks={GUIDED_ADMIN_TASKS.filter((task) => task.group === "streamingPayments")}
              selectedTask={resolvedSelectedTask}
              onSelectTask={handleFocusedTaskSelect}
              badgeByTask={guidedStreamingPaymentTaskBadges}
              disabledTaskIds={guidedStreamingPaymentsDisabledTasks}
              issueCount={countFieldErrorMessages(activeFieldErrors)}
              stats={
                <>
                  <div className="rounded-xl border border-border/60 bg-background/30 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Rules
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {streamingPaymentPayoutRows.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/30 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Selected payouts
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {streamingPaymentPayoutTransfers.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/30 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Funding refs
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {sttWalletInputs.length}
                    </p>
                  </div>
                </>
              }
            >
              <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="space-y-1">
                  <Label>Streaming payments ready for payout</Label>
                  <p className="text-xs text-muted-foreground">
                    Pick the streaming payments you want to pay now. The app tags the outputs and
                    updates the payout accounting automatically.
                  </p>
                </div>
                {streamingPaymentPayoutRows.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                    No streaming payments are present on the selected token.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {streamingPaymentPayoutRows.map((row) => {
                      const selectedAmount = row.configuredAmount;
                      const isSelected =
                        /^\d+$/.test(selectedAmount) && BigInt(selectedAmount) > 0n;

                      return (
                        <div
                          key={`streaming-payment-payout-${row.streamingPayment.id}`}
                          className="user-surface user-list-item rounded-lg border border-border/60 bg-muted/20 p-4"
                        >
                          <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-2">
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="font-medium text-foreground">
                                StreamingPayment {row.streamingPayment.id}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {row.streamingPayment.payoutAddress || "No payout address configured"}
                              </p>
                            </div>
                            <div className="ml-auto shrink-0">
                              <Badge variant={isSelected ? "secondary" : "outline"}>
                                {isSelected ? "Selected" : "Skipped"}
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                              Asset: {resolveAssetIdentity(row.unit).symbol}
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                              Paid out so far: {row.streamingPayment.paidOutAmount}
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                              Start: {formatTimestampLabel(Number(row.streamingPayment.startDate || "0"))}
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                              End: {formatTimestampLabel(Number(row.streamingPayment.endDate || "0"))}
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_220px]">
                            <label className="inline-flex items-center gap-2 text-sm text-foreground">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(event) =>
                                  setStreamingPaymentPayoutAmounts((current) => ({
                                    ...current,
                                    [row.streamingPayment.id]: event.target.checked
                                      ? row.dueAmount
                                      : "0"
                                  }))
                                }
                              />
                              Pay this streaming payment now
                            </label>
                            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                              Due now:{" "}
                              {row.unit === "lovelace"
                                ? `${formatLovelaceAsAda(row.dueAmount)} ADA`
                                : `${row.dueAmount} ${resolveAssetIdentity(row.unit).symbol}`}
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`streaming-payment-amount-${row.streamingPayment.id}`}>
                                {row.unit === "lovelace"
                                  ? "Payout amount (ADA)"
                                  : "Payout amount"}
                              </Label>
                              <Input
                                id={`streaming-payment-amount-${row.streamingPayment.id}`}
                                type="text"
                                inputMode={row.unit === "lovelace" ? "decimal" : "numeric"}
                                value={
                                  row.unit === "lovelace"
                                    ? formatLovelaceAsAda(selectedAmount)
                                    : selectedAmount
                                }
                                onChange={(event) =>
                                  setStreamingPaymentPayoutAmounts((current) => ({
                                    ...current,
                                    [row.streamingPayment.id]:
                                      row.unit === "lovelace"
                                        ? parseAdaToLovelace(event.target.value) ?? "0"
                                        : event.target.value
                                  }))
                                }
                              />
                            </div>
                          </div>
                          <InlineFieldError
                            message={getFirstFieldError(
                              activeFieldErrors,
                              `StreamingPayment ${row.streamingPayment.id}`
                            )}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                <InlineFieldError
                  message={getFirstFieldError(activeFieldErrors, "StreamingPayment payout")}
                />
              </div>
            </FocusedTaskSurface>
          ) : null}

          <SttSpendEditorsView />
        </div>
      );
}
