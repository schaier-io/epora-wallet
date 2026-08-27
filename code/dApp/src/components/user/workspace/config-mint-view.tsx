"use client";
import { useTranslations } from "next-intl";
import { FIELD_ERROR_IDS } from "@/components/user/workspace/field-error-ids";

import { sharedReferenceActionDisabledAtom, sharedReferenceActionLabelAtom } from "@/components/user/workspace/atoms/workspace-build-flags.atoms";
import { effectiveWalletAssetNameHexAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";

import {
  Loader2,
  Sparkles
} from "lucide-react";

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
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">{i18n("startWithTheEssentials")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {i18n("nameTheWalletAddItsFirstFundsThen")}
              </p>
            </div>
          </div>

          <SetupProgressStepper steps={mintSetupSteps} />

          {showSharedReferenceSetup ? (
            <div className="rounded-lg border border-border/60 bg-background/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{i18n("oneTimeSetup")}</p>
                    <InfoHint label={i18n("whyThisIsNeeded")} contentClassName="max-w-sm">
                      {i18n("oneSharedOnChainReferenceKeepsLaterTransactions")}
                    </InfoHint>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {i18n("requiredBeforeTheFirstWalletCanBeCreated")}
                  </p>
                </div>
                <Badge variant={sharedSttReferenceStoreLoading ? "warning" : "outline"}>
                  {sharedSttReferenceStoreLoading ? i18n("checking") : i18n("needed")}
                </Badge>
              </div>

              {sharedSttReferenceStoreLoading ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {i18n("checkingWhetherSetupIsAlreadyComplete")}
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
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                      <p className="text-sm font-medium text-foreground">
                        {sharedReferencePreview.preview.summary}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {i18n("approveThisOneTimeTransactionInYourConnected")}
                      </p>
                    </div>
                  ) : null}
                  {sharedReferenceBuildError ? (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                      {sharedReferenceBuildError}
                    </div>
                  ) : null}
                </div>
              )}

              {sharedReferenceSubmitHash ? (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <p className="text-sm font-medium text-foreground">{i18n("oneTimeSetupSubmitted")}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{i18n("transactionId")}</p>
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
            <InlineFieldError message={getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.walletName)} />
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
            <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{i18n("starterBalance")}</p>
                <InfoHint label={i18n("moreAboutStarterBalance")} contentClassName="max-w-sm">
                  {i18n("addTheFundsThisWalletShouldHoldRight")}
                </InfoHint>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {i18n("createWalletWithStarterBalance", {
                  amount: formatReceiptAmountSummary(mintStarterAssets)
                })}
              </p>
              <AssetListEditor
                label={i18n("addFundsNow")}
                helper={i18n("chooseTheAdaAndNativeAssetsThisWallet")}
                value={mintStarterAssets}
                onChange={setMintStarterAssets}
                availableAssets={walletBalanceSummary.assets}
                addLabel={i18n("addAsset")}
              />
              <InlineFieldError message={getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.starterFunds)} />
            </div>
          </div>

          <StateFormEditor
            label={i18n("walletRules")}
            helper={i18n("startWithTheConnectedWalletAsAnOwner")}
            value={mintStateForm}
            onChange={(nextState) => {
              setMintStateForm(nextState);
              setMintZeroAdminConfirmed(false);
            }}
            connectedPaymentKeyHash={activePaymentKeyHash}
            sttPolicyId={config.walletPolicyId}
            sttAssetNameHex={effectiveWalletAssetNameHex}
            zeroAdminConfirmed={mintZeroAdminConfirmed}
            onZeroAdminConfirmedChange={setMintZeroAdminConfirmed}
            showWalletNameEditor={false}
          />
          <InlineFieldError message={getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.walletRules)} />
          <InlineFieldError
            message={getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.noDirectOwner)}
          />
        </div>
      );
}
