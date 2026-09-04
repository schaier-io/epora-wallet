"use client";
import { useTranslations } from "next-intl";

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
import { InfoHint } from "@/components/ui/info-hint";

import { FUND_POOLS_HINT } from "@/components/user/workspace/mental-model-copy";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ProofOfLifeOverrideMode
} from "@/lib/contracts/state-form";

import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { DisclosureSection, GuidedDateTimeField, GuidedLockedUtxoSelector, InlineFieldError, WalletInputRefsEditor } from "@/components/user/workspace/editors";
import { formatAmountSummary, formatDurationMillisLabel, formatTimestampLabel, formatTransferControlId, getFirstFieldError, supportsSttFundPoolInputs } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useConsolidateForm } from "@/components/user/workspace/forms/use-consolidate-form";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";

export function SttSpendEditorsView() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigSttspendEditorsView");
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
  const supportsFundPoolInputs = supportsSttFundPoolInputs(activeSttActionTab.value);

  return (
    <>
          {/* Guided actions edit `sttWalletInputs` through the selector inside the Advanced
              settings section above, so the pool browser must stay gated off for them or the
              same input would render twice per tab. */}
          {!usesGuidedLockedInputSelector &&
          supportsFundPoolInputs &&
          activeSttActionTab.showLockedContractUtxoBrowser ? (
            <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>{activeSttActionTab.lockedInputsLabel}</Label>
                    {/* Every tab names "fund pools" here; only the wallet-home assets panel
                        said what one is. Same shared sentence as there, one click away. */}
                    <InfoHint label={i18n("whatFundPoolsAre")} contentClassName="max-w-xs">
                      {FUND_POOLS_HINT}
                    </InfoHint>
                  </div>
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
                  {i18n("refreshFunds")}
                </Button>
              </div>
              {/* The wallet address used to sit here as a bare 60-character string in a box of
                  its own, unlabelled, with no copy button and no explorer link. Nobody sends
                  anything to it on this screen: the pools below are the point. What the box was
                  really carrying is the reason the list is empty, so that is all it carries. */}
              {lockingContract.address ? null : (
                <p className="text-xs text-muted-foreground">{lockingContract.error}</p>
              )}
              {lockedContractUtxosError ? (
                <p className="text-xs text-rose-300">{lockedContractUtxosError}</p>
              ) : null}
              {lockingContract.address ? (
                lockedContractUtxos.length > 0 ? (
                  /* rounded-md, not rounded-lg: the panel around this is already rounded-lg,
                     and the rows inside repeated it again, so three nesting levels shared one
                     radius. */
                  <div className="max-h-56 space-y-2 overflow-auto rounded-md border border-border/60 bg-background/20 p-2">
                    {lockedContractUtxos.map((utxo) => (
                      <div
                        key={`${utxo.input.txHash}#${utxo.input.outputIndex}`}
                        className="flex w-full flex-wrap items-start gap-x-3 gap-y-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
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
                            {/* Not "Add fund pool": that is the label on the manual editor's
                                button lower down (`editors/asset-editors.tsx:321`), which adds
                                a blank row. This one picks a pool that already exists. */}
                            {i18n("useThisPool")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : lockedContractUtxosLoading || lockedContractUtxosError ? null : (
                  /* Not shown when the read failed: the error above already says the list could
                     not be filled, and "no funds found" next to it reported a failed read as an
                     empty wallet. */
                  <p className="text-xs text-muted-foreground">
                    {i18n("noSpendableWalletFundsFoundRightNow")}
                  </p>
                )
              ) : null}
            </div>
          ) : null}

          {!usesGuidedLockedInputSelector && supportsFundPoolInputs ? (
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
          {supportsFundPoolInputs ? (
            <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Fund pools")} />
          ) : null}

          {activeSttActionTab.showTransfers &&
          activeSttActionTab.showQuickTransferBuilder &&
          selectedAction !== "update-state" &&
          selectedAction !== "manage-streaming-payments" &&
          !isRecipientFirstGuidedAction &&
          !isGuidedStreamingPaymentAction ? (
            <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
              <div className="space-y-1">
                <Label>{i18n("quickTransferBuilder")}</Label>
                <p className="text-xs text-muted-foreground">
                  {activeSttActionTab.transferSelectorHelper}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-1">
                  <Label htmlFor="userSttTransferAddress">{i18n("sendToAddress_7ae0f3")}</Label>
                  <Input
                    id="userSttTransferAddress"
                    value={sttTransferAddress}
                    onChange={(event) => setSttTransferAddress(event.target.value)}
                    placeholder={i18n("addrTest")}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={addSttTransferRecipient}
                    disabled={availableLockedTransferAssets.length === 0}
                  >
                    {i18n("addRecipient")}
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
                              {i18n("sendAmount")}{resolveAssetIdentity(asset.unit).symbol})
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
                            {i18n("availableFromChosenFundPools")} {asset.quantity}{" "}
                            {resolveAssetIdentity(asset.unit).symbol}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`userSttTransferAmountInput-${controlId}`}>
                            {i18n("exactAmount_0e91d5")}
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
                  {i18n("noAssetsToSplitYetAddAFund")}
                </p>
              )}
              <InlineFieldError
                message={getFirstFieldError(activeFieldErrors, "Transfers / forwarded outputs")}
              />
            </div>
          ) : null}

          {usesGuidedLockedInputSelector || activeSttActionTab.showProofOfLifeOverride ? (
            <DisclosureSection
              /* One "Advanced settings" path, not two sibling disclosures: the fund picks and
                 the proof-of-life timer are both things the app computes for you, so a single
                 disclosure with a labelled group each reads as the one it-can-wait panel it
                 is. The group labels ("Which funds to spend" lives inside the selector) keep
                 each half findable once the section is open. */
              title={i18n("advancedSettings")}
              /* Describe what is actually inside: the funds-only actions get a funds sentence
                 (a timer sentence here named controls this tab never renders), the streaming
                 payout gets the fund-selection wording, and only the send — which really does
                 both — gets the combined sentence. */
              description={
                usesGuidedLockedInputSelector && activeSttActionTab.showProofOfLifeOverride
                  ? i18n("theAppAlreadyPicksTheFundsAndRenewsThe")
                  : usesGuidedLockedInputSelector
                    ? isGuidedStreamingPaymentAction
                      ? i18n("selectTheSharedWalletSFundsYouWant")
                      : // Not "the app can suggest them": `use-workspace-send-action-effects.ts:36-49`
                        // selects the fund pools for you the moment a payout is staged, so the reader
                        // who opened this expecting an empty list found it already filled in.
                        i18n("theAppAlreadyPicksWhichFundsToSpend")
                    : selectedAction === "renew-proof-of-life"
                      ? i18n("autoSuitsMostCheckInsOpenThisOnly")
                      : i18n("autoSuitsMostSendsOpenThisOnlyTo")
              }
              defaultOpen={supportsFundPoolInputs && sttWalletInputs.length > 0}
            >
              {activeSttActionTab.showProofOfLifeOverride ? (
                <section className="space-y-3">
                  {/* No border, background, or padding of its own: the disclosure is already
                      a rounded-lg bordered panel with px-4, and the old inner box drew a
                      second frame at the identical radius inside the first. */}
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-foreground">
                      {i18n("proofOfLife")}
                    </h3>
                    {/* The old pair named a control that does not exist ("Renew Proof of life";
                       the tab is "Refresh proof of life") and offered a choice that does not
                       exist ("keep the proof of life unchanged"; the three options are Auto,
                       clear, and an exact date). Both now describe the options actually below. */}
                    {/* Only while the section's own description is about the funds: for the
                        timer-only tabs the description above already says this sentence. */}
                    {usesGuidedLockedInputSelector ? (
                      <p className="text-xs text-muted-foreground">
                        {i18n("autoSuitsMostSendsOpenThisOnlyTo")}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    {/* Not "Proof of life Update": the group heading directly above already
                        says "Proof of life", so the label only had to say what the choice does. */}
                    <Label htmlFor="userSttProofOfLifeOverrideMode">{i18n("whatHappensToTheTimer")}</Label>
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
                      <option value="auto">{i18n("autoRecommended")}</option>
                      <option value="none">{i18n("clearTheProofOfLife")}</option>
                      <option value="specific">{i18n("chooseADateAndTime")}</option>
                    </Select>
                  </div>
                  {sttProofOfLifeOverrideMode === "specific" ? (
                    <GuidedDateTimeField
                      idPrefix="user-stt-proof-of-life-specific"
                      label={i18n("specificProofOfLifeDate")}
                      value={sttProofOfLifeSpecificDateTime}
                      onChange={setSttProofOfLifeSpecificDateTime}
                      /* The field already prints "Saved as <local date and time>." underneath,
                         so restating that it gets stored told the reader nothing. What the date
                         means is the part they cannot work out ("Recovery can start after",
                         `editors/state-form-editor.tsx:375`). */
                      helper={i18n("recoveryCannotStartBeforeThisMoment")}
                    />
                  ) : null}
                  <InlineFieldError
                    message={getFirstFieldError(activeFieldErrors, "Specific proof of life date")}
                  />
                  {/* Deadline first: it is the fact the reader came for. The third paragraph
                      this block used to open with ("Applied when preparing Send funds…") only
                      restated that a control inside the send form affects the send. */}
                  <p className="text-xs text-muted-foreground">
                    {sttProofOfLifeUnlockTime === undefined
                      ? i18n("theCurrentProofOfLifeDeadlineCouldNot")
                      : sttProofOfLifeUnlockTime === null
                        ? i18n("noProofOfLifeIsSetOnThis")
                        : i18n("recoveryCanStartAfterValue1", { value1: formatTimestampLabel(sttProofOfLifeUnlockTime) })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {sttProofOfLifeIncrement === undefined
                      ? i18n("theCurrentProofOfLifeExtensionCouldNot")
                      : sttProofOfLifeIncrement === null
                        ? i18n("thisWalletSetsNoProofOfLifeExtension")
                        : // Not the raw number: the datum stores milliseconds, so the default
                          // 30-day timer read as "extends the proof of life by 2592000000".
                          i18n("eachCheckInExtendsItByValue1Auto", { value1: formatDurationMillisLabel(sttProofOfLifeIncrement) })}
                  </p>
                </section>
              ) : null}
              {usesGuidedLockedInputSelector ? (
                <section
                  className={activeSttActionTab.showProofOfLifeOverride ? "border-t border-border/50 pt-4" : undefined}
                >
                  <GuidedLockedUtxoSelector
                    utxos={lockedContractUtxos}
                    selectedRefs={sttWalletInputs}
                    onChange={setSttWalletInputs}
                    onSuggest={applySuggestedLockedInputs}
                    error={lockedContractUtxosError}
                    onRefresh={
                      lockingContract.address
                        ? () => void refreshLockedContractUtxos(lockingContract.address)
                        : undefined
                    }
                    helper={
                      isGuidedStreamingPaymentAction
                        ? i18n("optionalLeaveItEmptyAndThePaymentComes")
                        : i18n("selectedForYouOnceYouAddAPayout")
                    }
                  />
                </section>
              ) : null}
            </DisclosureSection>
          ) : null}
    </>
  );
}
