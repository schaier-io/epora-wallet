"use client";
import { useTranslations } from "next-intl";
import { FIELD_ERROR_IDS } from "@/components/user/workspace/field-error-ids";

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
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/guided-admin-catalog";
import { FocusedPeopleEditor, FocusedStreamingPaymentRulesEditor, FocusedTaskSurface, FocusedWalletSettingsEditor, InlineFieldError, SearchableAssetUnitDropdown, StateFormEditor } from "@/components/user/workspace/editors";
import { countFieldErrorMessages, formatAmountSummary, formatTimestampLabel, getFirstFieldError, shortenAddress } from "@/components/user/workspace/helpers";

import { SttSpendEditorsView } from "@/components/user/workspace/config-sttspend-editors-view";
import { useConfigSttSpendState } from "@/components/user/workspace/use-config-sttspend-state";

export function SttSpendConfigView() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigSttspendView");
  const {
    availableLockedTransferAssets,
    availableLockedTransferAssetOptions,
    selectedTransferAsset,
    streamingPaymentPayoutRows,
    streamingPaymentPayoutTransfers,
    recentRecipients,
    activeAddress,
    activePaymentKeyHash,
    activeSttActionTab,
    activeSttAuthorityOptions,
    effectiveWalletAssetNameHex,
    resolvedSelectedTask,
    selectedAction,
    selectedDetectedToken,
    selectedDetectedTokenStateForm,
    selectedIntent,
    useAllowancePreview,
    config,
    activeFieldErrors,
    addSimpleTransferRecipient,
    flowAvailability,
    guidedStreamingPaymentTaskBadges,
    guidedStreamingPaymentsDisabledTasks,
    handleFocusedTaskSelect,
    consolidateAuthorityPath,
    setConsolidateAuthorityPath,
    setStreamingPaymentPayoutAmounts,
    setSttAuthorityPath,
    setSttExtraTransfers,
    setSttStateForm,
    setSttZeroAdminConfirmed,
    sttAuthorityPath,
    sttExtraTransfers,
    sttStateForm,
    sttWalletInputs,
    sttZeroAdminConfirmed,
    setTransferCustomAddress,
    setTransferDisplayAmount,
    setTransferRecipientMode,
    setTransferSelectedUnit,
    transferCustomAddress,
    transferDisplayAmount,
    transferRecipientMode,
    transferSelectedUnit
  } = useConfigSttSpendState();

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
                  ? i18n("thisWallet")
                  : i18n("selectASmartWalletFirst")}
              </Badge>
              {activeSttAuthorityOptions.length > 1 ? (
                <>
                  <Label htmlFor="sttAuthorityPath" className="sr-only">
                    {i18n("authorizationPath")}
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
                  existingStreamingPaymentIds={new Set(
                    selectedDetectedTokenStateForm?.streamingPayments.map(
                      (streamingPayment) => streamingPayment.id
                    ) ?? []
                  )}
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
                  existingStreamingPaymentIds={new Set(
                    selectedDetectedTokenStateForm?.streamingPayments.map(
                      (streamingPayment) => streamingPayment.id
                    ) ?? []
                  )}
                  allowNewStreamingPayments={false}
                />
              )}
              <InlineFieldError message={getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.outputState)} />
              <InlineFieldError
                message={getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.noDirectOwner)}
              />
            </>
          ) : null}

          {selectedAction === "use-allowance" ? (
            <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-4">
              <div className="space-y-1">
                <Label>{i18n("yourSpendingAllowance")}</Label>
                <p className="text-xs text-muted-foreground">
                  {i18n("thisSignerMatchesOneSpenderThePreviewShows")}
                </p>
              </div>
              {useAllowancePreview.error ? (
                <p className="text-xs text-rose-300">{useAllowancePreview.error}</p>
              ) : useAllowancePreview.target ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("spender")} {useAllowancePreview.target.matchedUserId}
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("signerKeys")} {useAllowancePreview.target.matchedUserWallets.length}
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("remainingBeforePayment")}{" "}
                      {formatAmountSummary(useAllowancePreview.target.currentRemainingAllowance)}
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("nextReset")}{" "}
                      {formatTimestampLabel(
                        useAllowancePreview.computation?.nextAllowanceReset ??
                          useAllowancePreview.target.nextAllowanceReset
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("availableNow")}{" "}
                      {formatAmountSummary(
                        useAllowancePreview.target.effectiveRemainingAllowance
                      )}
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("thisPayment")}{" "}
                      {useAllowancePreview.computation
                        ? formatAmountSummary(useAllowancePreview.computation.spentAllowance)
                        : i18n("notDerivedYet")}
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("remainingAfterSpend")}{" "}
                      {useAllowancePreview.computation
                        ? formatAmountSummary(
                            useAllowancePreview.computation.resultingRemainingAllowance
                          )
                        : i18n("notDerivedYet")}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {isRecipientFirstGuidedAction ? (
            <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-4">
              <div className="space-y-1">
                <Label>{i18n("sendFromThisSmartWallet")}</Label>
                <p className="text-xs text-muted-foreground">
                  {i18n("chooseWhoToPayAndHowMuchThen")}
                </p>
              </div>
              <div className="max-w-sm space-y-1.5">
                <Label htmlFor="walletRecipientSelect">{i18n("recipient")}</Label>
                <select
                  id="walletRecipientSelect"
                  value={transferRecipientMode}
                  onChange={(event) => setTransferRecipientMode(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {activeAddress ? <option value="my-address">{i18n("myAddress")}</option> : null}
                  {recentRecipients.map((entry) => (
                    <option key={`recent-${entry}`} value={`recent:${entry}`}>
                      {i18n("recentValue1", { value1: shortenAddress(entry) })}
                    </option>
                  ))}
                  <option value="custom">{i18n("customAddress")}</option>
                </select>
              </div>
              {transferRecipientMode === "custom" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="walletRecipientCustom">{i18n("customAddress")}</Label>
                  <Input
                    id="walletRecipientCustom"
                    value={transferCustomAddress}
                    onChange={(event) => setTransferCustomAddress(event.target.value)}
                    placeholder={i18n("pasteAPreprodAddress")}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {i18n("sendingTo")}{" "}
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
                      {transferSelectedUnit === "lovelace" ? i18n("howMuchAda") : i18n("howMuch")}
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
                        {i18n("max")}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="walletAssetSelect">{i18n("asset")}</Label>
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
                      {i18n("addToPayment")}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {i18n("loadThisWalletSFundPoolsBeforeChoosing")}
                </p>
              )}
              {availableLockedTransferAssets.length > 0 && sttExtraTransfers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {i18n.rich("enterAmountThenAddToPayment", {
                    add: (chunks) => <span className="font-medium text-foreground">{chunks}</span>
                  })}
                </p>
              ) : null}
              {sttExtraTransfers.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {i18n("paymentRecipients")}
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
                          {i18n("remove")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <InlineFieldError
                message={getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.recipients)}
              />
            </div>
          ) : null}

          {isGuidedStreamingPaymentAction ? (
            <FocusedTaskSurface
              title={i18n("scheduledPayments")}
              description={i18n("chooseDueSchedulesAndReviewTheAmountsBefore")}
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
                      {i18n("rules")}
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {streamingPaymentPayoutRows.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/30 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {i18n("selectedPayouts")}
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {streamingPaymentPayoutTransfers.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/30 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {i18n("selectedFundPools")}
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
                  <Label>{i18n("scheduledPaymentsReadyToPay")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {i18n("chooseTheSchedulesToPayNowTheApp")}
                  </p>
                </div>
                {streamingPaymentPayoutRows.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                    {i18n("noScheduledPaymentsArePresentOnTheSelected")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {streamingPaymentPayoutRows.map((row) => {
                      const selectedAmount = row.configuredAmount;
                      const isSelected =
                        /^\d+$/.test(selectedAmount) && BigInt(selectedAmount) > 0n;
                      const isCleanup = row.cleanupRequired;

                      return (
                        <div
                          key={`streaming-payment-payout-${row.streamingPayment.id}`}
                          className="user-surface user-list-item rounded-lg border border-border/60 bg-muted/20 p-4"
                        >
                          <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-2">
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="font-medium text-foreground">
                                {i18n("schedule")}{row.streamingPayment.id}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {row.streamingPayment.payoutAddress || i18n("noPayoutAddressConfigured")}
                              </p>
                            </div>
                            <div className="ml-auto shrink-0">
                              <Badge variant={isSelected || isCleanup ? "secondary" : "outline"}>
                                {isCleanup ? i18n("removeCompleted") : isSelected ? i18n("selected") : i18n("notSelected")}
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                              {i18n("asset_b46616")} {resolveAssetIdentity(row.unit).symbol}
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                              {i18n("paidOutSoFar")} {row.streamingPayment.paidOutAmount}
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                              {i18n("start")} {formatTimestampLabel(Number(row.streamingPayment.startDate || "0"))}
                            </div>
                            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                              {i18n("end")} {formatTimestampLabel(Number(row.streamingPayment.endDate || "0"))}
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_220px]">
                            <label className="inline-flex items-center gap-2 text-sm text-foreground">
                              <input
                                type="checkbox"
                                checked={isSelected || isCleanup}
                                disabled={isCleanup}
                                onChange={(event) =>
                                  setStreamingPaymentPayoutAmounts((current) => ({
                                    ...current,
                                    [row.streamingPayment.id]: event.target.checked
                                      ? row.dueAmount
                                      : "0"
                                  }))
                                }
                              />
                              {isCleanup
                                ? i18n("removeFullySettledSchedule")
                                : i18n("payThisScheduleNow")}
                            </label>
                            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                              {i18n("dueNow")}{" "}
                              {row.unit === "lovelace"
                                ? i18n("value1Ada", { value1: formatLovelaceAsAda(row.dueAmount) })
                                : i18n("value1Value2", { value1: row.dueAmount, value2: resolveAssetIdentity(row.unit).symbol })}
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`streaming-payment-amount-${row.streamingPayment.id}`}>
                                {row.unit === "lovelace"
                                  ? i18n("payoutAmountAda")
                                  : i18n("payoutAmount")}
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
                              i18n("scheduledPaymentValue1", { value1: row.streamingPayment.id })
                            )}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                <InlineFieldError
                  message={getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.scheduledPaymentPayout)}
                />
              </div>
            </FocusedTaskSurface>
          ) : null}

          <SttSpendEditorsView />
        </div>
      );
}
