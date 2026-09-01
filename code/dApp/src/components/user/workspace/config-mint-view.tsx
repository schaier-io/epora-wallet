"use client";
import { useTranslations } from "next-intl";

import { sharedReferenceActionDisabledAtom, sharedReferenceActionLabelAtom } from "@/components/user/workspace/atoms/workspace-build-flags.atoms";
import { effectiveWalletAssetNameHexAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";

import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { InfoHint } from "@/components/ui/info-hint";

import { AssetListEditor, InlineFieldError, SetupProgressStepper, StateFormEditor, WalletNameEditor } from "@/components/user/workspace/editors";
import { formatReceiptAmountSummary, getFirstFieldError } from "@/components/user/workspace/helpers";

import { useAtomValue } from "jotai";
import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { sharedReferenceBuildErrorAtom, sharedReferenceBusyAtom, sharedReferencePreviewAtom, sharedReferenceSubmitHashAtom, sharedSttReferenceStoreLoadingAtom, walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { useMintForm } from "@/components/user/workspace/forms/use-mint-form";

export function MintConfigView() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigMintView");
  const state = useWorkspaceActions();
  const sharedReferenceActionLabel = useAtomValue(sharedReferenceActionLabelAtom);
  const sharedReferenceActionDisabled = useAtomValue(sharedReferenceActionDisabledAtom);
  const activePaymentKeyHash = useAtomValue(activePaymentKeyHashAtom);
  const activeAddress = useAtomValue(activeAddressAtom);
  const effectiveWalletAssetNameHex = useAtomValue(effectiveWalletAssetNameHexAtom);
  const sharedSttReferenceStoreLoading = useAtomValue(sharedSttReferenceStoreLoadingAtom);
  const sharedReferencePreview = useAtomValue(sharedReferencePreviewAtom);
  const sharedReferenceBuildError = useAtomValue(sharedReferenceBuildErrorAtom);
  const sharedReferenceSubmitHash = useAtomValue(sharedReferenceSubmitHashAtom);
  const sharedReferenceBusy = useAtomValue(sharedReferenceBusyAtom);
  const config = useAtomValue(configAtom);
  const walletBalanceSummary = useAtomValue(walletBalanceSummaryAtom);
  const {
    activeFieldErrors,
    createInlineSharedReference,
    mintSetupSteps,
    showSharedReferenceSetup
  } = state;
  const { mintStarterAssets, mintStateForm, mintZeroAdminConfirmed, setMintStarterAssets, setMintStateForm, setMintZeroAdminConfirmed } = useMintForm();

      return (
        <div className="space-y-4">
          {/* No heading panel here. `UserActionConfigurationCard` already renders a title and
              a description for this action, so a second pair immediately below it said the
              same thing twice. What that pair knew and the card did not (this is one shared
              wallet, and it recovers keys) moved into the card's own description. */}
          <SetupProgressStepper steps={mintSetupSteps} />

          {showSharedReferenceSetup ? (
            <div
              id="mint-section-helper"
              className="scroll-mt-20 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{i18n("oneTimeSetupHelper")}</p>
                    <InfoHint label={i18n("moreAboutSetupHelper")} contentClassName="max-w-sm">
                      {i18n("youApproveItOnceInYourWalletEvery")}
                    </InfoHint>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {i18n("createThisOnceEveryLaterActionIsThen")}
                  </p>
                </div>
                <Badge variant={sharedSttReferenceStoreLoading ? "warning" : "outline"}>
                  {sharedSttReferenceStoreLoading ? i18n("checking") : i18n("needed")}
                </Badge>
              </div>

              {sharedSttReferenceStoreLoading ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {i18n("checkingWhetherThisHelperAlreadyExists")}
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        void createInlineSharedReference();
                      }}
                      disabled={sharedReferenceActionDisabled}
                    >
                      {sharedReferenceBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {sharedReferenceActionLabel}
                    </Button>
                  </div>
                  {sharedReferencePreview ? (
                    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                      <p className="text-sm font-medium text-foreground">
                        {sharedReferencePreview.preview.summary}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {i18n("yourWalletWillOpenToApproveThisHelper")}
                      </p>
                    </div>
                  ) : null}
                  {sharedReferenceBuildError ? (
                    <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                      {sharedReferenceBuildError}
                    </div>
                  ) : null}
                </div>
              )}

              {sharedReferenceSubmitHash ? (
                <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-sm font-medium text-foreground">{i18n("setupHelperCreated")}</p>
                  <p className="mt-2 break-all font-mono text-xs text-foreground">
                    {sharedReferenceSubmitHash}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <WalletNameEditor
              value={mintStateForm.walletName}
              onChange={(walletName) => {
                setMintStateForm((current) => ({ ...current, walletName }));
              }}
            />
            <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Wallet name")} />
          </div>

          {/* Not a grid. It declared two columns and only ever had one child, so the panel
              rendered at 65% width on md+ with the other 35% permanently empty. */}
          <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{i18n("starterBalance")}</p>
                <InfoHint label={i18n("moreAboutStarterBalance")} contentClassName="max-w-sm">
                  {i18n("addTheFundsThisWalletShouldHoldRight")}
                </InfoHint>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {i18n("createTheWalletAndPlace")} {formatReceiptAmountSummary(mintStarterAssets)} {i18n("insideIt")}
              </p>
            </div>
            <AssetListEditor
              label={i18n("addFundsNow")}
              helper={i18n("keepTheDefaultAdaAmountOrAddAny")}
              value={mintStarterAssets}
              onChange={setMintStarterAssets}
              availableAssets={walletBalanceSummary.assets}
              addLabel={i18n("addAsset")}
            />
            <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Starter funds")} />
          </div>

          {/* Scroll anchor for the "Choose people" setup step: the stepper sits at the top of
              the view while this editor is a screen or more down the page. */}
          <div id="mint-section-people" className="scroll-mt-20 space-y-4">
            <StateFormEditor
              label={i18n("walletRules")}
              helper={i18n("startWithTheConnectedWalletAsAnOwner")}
              value={mintStateForm}
              onChange={(nextState) => {
                setMintStateForm(nextState);
                setMintZeroAdminConfirmed(false);
              }}
              connectedPaymentKeyHash={activePaymentKeyHash}
              connectedAddress={activeAddress}
              sttPolicyId={config.walletPolicyId}
              sttAssetNameHex={effectiveWalletAssetNameHex}
              zeroAdminConfirmed={mintZeroAdminConfirmed}
              onZeroAdminConfirmedChange={setMintZeroAdminConfirmed}
              showWalletNameEditor={false}
            />
            <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Wallet rules")} />
            <InlineFieldError
              message={getFirstFieldError(activeFieldErrors, "Wallet with no owner")}
            />
          </div>
        </div>
      );
}
