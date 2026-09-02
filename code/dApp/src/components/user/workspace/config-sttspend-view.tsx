"use client";
import { useTranslations } from "next-intl";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";
import {
  type AuthorityPath,
  type ConsolidateAuthorityPath } from "@/lib/types/contracts";
import { PreprodFaucetHint } from "@/components/user/preprod-faucet-hint";
import { FocusedPeopleEditor, FocusedStreamingPaymentRulesEditor, FocusedWalletSettingsEditor, InlineFieldError, SearchableAssetUnitDropdown, StateFormEditor } from "@/components/user/workspace/editors";
import { formatAmountSummary, formatTimestampLabel, getFirstFieldError, shortenAddress } from "@/components/user/workspace/helpers";

import { lockedContractUtxosErrorAtom, lockedContractUtxosLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { lockingContractAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { useAtomValue } from "jotai";
import { SttSpendEditorsView } from "@/components/user/workspace/config-sttspend-editors-view";
import { SttSpendPayoutView } from "@/components/user/workspace/config-sttspend-payout-view";
import { useConfigSttSpendState } from "@/components/user/workspace/use-config-sttspend-state";
import { type PayoutRejection } from "@/components/user/workspace/workspace-stt-editors";

export function SttSpendConfigView() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigSttspendView");
  // Staging rejections belong to the control that caused them, not to the review rail.
  const [payoutRejection, setPayoutRejection] = useState<PayoutRejection | null>(null);
  const lockedContractUtxosLoading = useAtomValue(lockedContractUtxosLoadingAtom);
  const lockedContractUtxosError = useAtomValue(lockedContractUtxosErrorAtom);
  const lockingContract = useAtomValue(lockingContractAtom);
  const recipientRejection =
    payoutRejection?.field === "recipient" ? payoutRejection.message : null;
  const amountRejection = payoutRejection?.field === "amount" ? payoutRejection.message : null;
  const assetRejection = payoutRejection?.field === "asset" ? payoutRejection.message : null;
  const {
    availableLockedTransferAssets,
    availableLockedTransferAssetOptions,
    selectedTransferAsset,
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
    handleFocusedTaskSelect,
    consolidateAuthorityPath,
    setConsolidateAuthorityPath,
    setSttAuthorityPath,
    setSttExtraTransfers,
    setSttStateForm,
    setSttZeroAdminConfirmed,
    sttAuthorityPath,
    sttExtraTransfers,
    sttStateForm,
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
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{activeSttActionTab.label}</Badge>
              {/* Only the warning state is news. "This wallet" was a badge whose whole value
                  was a demonstrative pronoun, next to a header that already names the wallet. */}
              {selectedDetectedToken ? null : (
                <Badge variant="warning">{i18n("selectASmartWalletFirst")}</Badge>
              )}
              {activeSttAuthorityOptions.length > 1 ? (
                <>
                  <Label htmlFor="sttAuthorityPath" className="sr-only">
                    {i18n("authorizationPath")}
                  </Label>
                  <Select
                    id="sttAuthorityPath"
                    // Kept at h-8: this sits in a row of Badges (py-0.5 text-xs, ~22px),
                    // not among 40px controls. The primitive supplies the focus ring it
                    // was missing.
                    className="h-8 w-auto min-w-[10rem] px-2 text-xs"
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
                  </Select>
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
              <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Output state")} />
              <InlineFieldError
                message={getFirstFieldError(activeFieldErrors, "Wallet with no owner")}
              />
            </>
          ) : null}

          {selectedAction === "use-allowance" ? (
            <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
              <div className="space-y-1">
                <Label>{i18n("yourSpendingLimit")}</Label>
                {/* Was: "The connected payment key hash plus the requested spend must resolve to
                    exactly one spender. This mode derives the next STT datum automatically
                    instead of allowing manual state edits." A spender on this screen needs to
                    know what they may spend, not how the datum is derived. */}
                <p className="text-xs text-muted-foreground">
                  {i18n("thisWalletGivesYouAnAllowanceToSpend")}
                </p>
              </div>
              {useAllowancePreview.error ? (
                <p className="text-xs text-rose-300">{useAllowancePreview.error}</p>
              ) : useAllowancePreview.target ? (
                <>
                  {/* Seven tiles became five. "Matched user: 3" and "Wallets: 2" were raw
                      identifiers a spender cannot act on, and "Current remaining" sat beside
                      "Effective allowance now" as a second, different number for the same idea:
                      the effective one is what can actually be spent, so it is the one kept.
                      "Not derived yet" said the app had not computed, rather than what to do. */}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("matchedAsSpender")}{useAllowancePreview.target.matchedUserId}
                    </div>
                    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("limitResets")}{" "}
                      {formatTimestampLabel(
                        useAllowancePreview.computation?.nextAllowanceReset ??
                          useAllowancePreview.target.nextAllowanceReset
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("youCanSpendNow")}{" "}
                      {formatAmountSummary(
                        useAllowancePreview.target.effectiveRemainingAllowance
                      )}
                    </div>
                    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("thisSendUses")}{" "}
                      {useAllowancePreview.computation
                        ? formatAmountSummary(useAllowancePreview.computation.spentAllowance)
                        : i18n("enterAnAmountFirst")}
                    </div>
                    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("leftAfterThisSend")}{" "}
                      {useAllowancePreview.computation
                        ? formatAmountSummary(
                            useAllowancePreview.computation.resultingRemainingAllowance
                          )
                        : i18n("enterAnAmountFirst")}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {isRecipientFirstGuidedAction ? (
            <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
              <div className="space-y-1">
                <Label>{i18n("sendFromThisSmartWallet")}</Label>
                {/* Was four steps in one sentence, ending in a parenthetical that named
                    "Select suggested inputs", a button inside a collapsed Advanced section the
                    reader cannot see yet. The app picks the fund pools on its own, so the last
                    two steps are not the reader's to take. */}
                <p className="text-xs text-muted-foreground">
                  {i18n("pickARecipientAndAnAmountThenAdd")}
                </p>
              </div>
              <div className="max-w-sm space-y-1">
                <Label htmlFor="walletRecipientSelect">{i18n("recipient")}</Label>
                <Select
                  id="walletRecipientSelect"
                  value={transferRecipientMode}
                  onChange={(event) => {
                    setPayoutRejection(null);
                    setTransferRecipientMode(event.target.value);
                  }}
                  aria-invalid={recipientRejection ? true : undefined}
                  aria-describedby={recipientRejection ? "walletRecipientSelect-error" : undefined}
                >
                  <option value="">{i18n("chooseARecipient")}</option>
                  {activeAddress ? <option value="my-address">{i18n("myAddress")}</option> : null}
                  {recentRecipients.map((entry) => (
                    <option key={`recent-${entry}`} value={`recent:${entry}`}>
                      {i18n("recentValue1", { value1: shortenAddress(entry) })}
                    </option>
                  ))}
                  <option value="custom">{i18n("customAddress")}</option>
                </Select>
                {transferRecipientMode !== "custom" ? (
                  <InlineFieldError
                    id="walletRecipientSelect-error"
                    message={recipientRejection}
                  />
                ) : null}
              </div>
              {transferRecipientMode === "custom" ? (
                <div className="space-y-1">
                  <Label htmlFor="walletRecipientCustom">{i18n("customAddress")}</Label>
                  <Input
                    id="walletRecipientCustom"
                    value={transferCustomAddress}
                    onChange={(event) => {
                      setPayoutRejection(null);
                      setTransferCustomAddress(event.target.value);
                    }}
                    placeholder={i18n("addrTest")}
                    aria-invalid={recipientRejection ? true : undefined}
                    aria-describedby={
                      recipientRejection ? "walletRecipientCustom-error" : undefined
                    }
                  />
                  <InlineFieldError
                    id="walletRecipientCustom-error"
                    message={recipientRejection}
                  />
                </div>
              ) : transferRecipientMode ? (
                <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {/* "Will send to", not "Sending to". This box renders from the recipient
                      dropdown alone and never consults `sttExtraTransfers`, so it was
                      stating a send was under way while the review rail beside it read
                      "Recipient: None added yet". It is also skipped entirely while no
                      recipient is chosen, which is now the starting state. */}
                  {i18n("willSendTo")}{" "}
                  <span className="font-medium text-foreground">
                    {transferRecipientMode === "my-address"
                      ? shortenAddress(activeAddress)
                      : shortenAddress(transferRecipientMode.slice("recent:".length))}
                  </span>
                </div>
              ) : null}
              {availableLockedTransferAssets.length > 0 ? (
                <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto]">
                  <div className="space-y-1">
                    <Label htmlFor="walletTransferAmount">
                      {transferSelectedUnit === "lovelace" ? i18n("howMuchAda") : i18n("howMuch")}
                    </Label>
                    <div className="relative">
                      <Input
                        id="walletTransferAmount"
                        type="text"
                        inputMode={transferSelectedUnit === "lovelace" ? "decimal" : "numeric"}
                        value={transferDisplayAmount}
                        onChange={(event) => {
                          setPayoutRejection(null);
                          setTransferDisplayAmount(event.target.value);
                        }}
                        placeholder={transferSelectedUnit === "lovelace" ? "0.00" : "0"}
                        className="pr-14"
                        aria-invalid={amountRejection ? true : undefined}
                        aria-describedby={
                          amountRejection ? "walletTransferAmount-error" : undefined
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        /* h-8 + sm:h-8, not h-7: size="sm" ships sm:h-9, and the sm variant
                           outranked an unconditional h-7, so on desktop the button rendered
                           36px tall in this 40px input — 2px of air above and below against
                           4px on the right. 32px leaves the same 4px on all three sides. */
                        className="absolute right-1 top-1/2 h-8 sm:h-8 -translate-y-1/2 px-2"
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
                    <InlineFieldError id="walletTransferAmount-error" message={amountRejection} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="walletAssetSelect">{i18n("asset")}</Label>
                    <SearchableAssetUnitDropdown
                      id="walletAssetSelect"
                      value={transferSelectedUnit}
                      options={availableLockedTransferAssetOptions}
                      onChange={(unit) => {
                        setPayoutRejection(null);
                        setTransferSelectedUnit(unit);
                      }}
                    />
                    <InlineFieldError id="walletAssetSelect-error" message={assetRejection} />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setPayoutRejection(addSimpleTransferRecipient())}
                      disabled={availableLockedTransferAssets.length === 0}
                    >
                      {i18n("addPayout")}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Two situations wore one message: the fund pools are still being read, or the
                   wallet really is empty. "Load the locked funds first" also told the reader to
                   do something this screen offers no control for. */
                !lockingContract.address ? (
                  /* `refreshLockedContractUtxos` short-circuits to an empty list with no error
                     and no loading flag when the address is null (`use-locked-contract-utxos.ts:31-36`),
                     so a wallet that simply has not resolved was reported as a wallet with no
                     money in it. `lockingContract.error` carries the real reason. */
                  <p className="text-xs text-muted-foreground">
                    {lockingContract.error ?? i18n("thisWalletIsNotOpenYet")}
                  </p>
                ) : lockedContractUtxosLoading ? (
                  <p className="text-xs text-muted-foreground">
                    {i18n("checkingThisWalletSFunds")}
                  </p>
                ) : lockedContractUtxosError ? (
                  /* A failed read leaves the pool list empty too, so without this branch a
                     network error was reported to the reader as an empty wallet. */
                  <p className="text-xs text-rose-300">
                    {lockedContractUtxosError} {i18n("tryAgainInAMoment")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {i18n("thisWalletHasNothingToSendYetAdd")}
                  </p>
                )
              )}
              {lockingContract.address && !lockedContractUtxosLoading && !lockedContractUtxosError && availableLockedTransferAssets.length === 0 ? (
                /* The wallet is connected and has been read, and it is empty: the reader
                   needs test funds before anything on this screen can move. */
                <PreprodFaucetHint />
              ) : null}
              {availableLockedTransferAssets.length > 0 && sttExtraTransfers.length === 0 ? (
                /* The review rail beside this already says "Add a payout before you send. Pick a
                   recipient, enter an amount, then Add payout." This kept only the part it does
                   not say: why the receipt still looks empty. */
                <p className="text-[11px] text-muted-foreground">
                  {i18n("theReceiptFillsInOnceYouAddA")}
                </p>
              ) : null}
              {sttExtraTransfers.length > 0 ? (
                <div className="space-y-2">
                  <p className="eyebrow font-medium text-muted-foreground">
                    {i18n("pendingPayouts")}
                  </p>
                  {sttExtraTransfers.map((transfer, index) => (
                    <div
                      key={`simple-transfer-${index}`}
                      className="flex w-full flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-border/60 bg-muted/20 p-3"
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
                message={getFirstFieldError(activeFieldErrors, "Transfers / forwarded outputs")}
              />
            </div>
          ) : null}

          {isGuidedStreamingPaymentAction ? <SttSpendPayoutView /> : null}

          <SttSpendEditorsView />
        </div>
      );
}
