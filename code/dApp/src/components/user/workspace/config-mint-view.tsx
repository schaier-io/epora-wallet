"use client";
import { sharedReferenceActionDisabledAtom, sharedReferenceActionLabelAtom } from "@/components/user/workspace/atoms/workspace-build-flags.atoms";
import { effectiveWalletAssetNameHexAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";

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
        <div className="space-y-4">
          {/* No heading panel here. `UserActionConfigurationCard` already renders a title and
              a description for this action, so a second pair immediately below it said the
              same thing twice. What that pair knew and the card did not (this is one shared
              wallet, and it recovers keys) moved into the card's own description. */}
          <SetupProgressStepper steps={mintSetupSteps} />

          {showSharedReferenceSetup ? (
            <div className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">One-time setup helper</p>
                    <InfoHint label="More about setup helper" contentClassName="max-w-sm">
                      You approve it once in your wallet. Every action in every wallet you own
                      reuses it after that, so you never see this step again.
                    </InfoHint>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Create this once. Every later action is then smaller and cheaper to send.
                  </p>
                </div>
                <Badge variant={sharedSttReferenceStoreLoading ? "warning" : "outline"}>
                  {sharedSttReferenceStoreLoading ? "Checking" : "Needed"}
                </Badge>
              </div>

              {sharedSttReferenceStoreLoading ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Checking whether this helper already exists…
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
                        Your wallet will open to approve this helper.
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
                  <p className="text-sm font-medium text-foreground">Setup helper created</p>
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
                <p className="text-sm font-medium text-foreground">Starter balance</p>
                <InfoHint label="More about starter balance" contentClassName="max-w-sm">
                  Add the funds this wallet should hold right after it is created. ADA is
                  recommended, and native assets can be included when the connected wallet already
                  has them.
                </InfoHint>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Create the wallet and place {formatReceiptAmountSummary(mintStarterAssets)} inside it.
              </p>
            </div>
            <AssetListEditor
              label="Add funds now"
              helper="Keep the default ADA amount, or add any tokens you want in the wallet from the start."
              value={mintStarterAssets}
              onChange={setMintStarterAssets}
              availableAssets={walletBalanceSummary.assets}
              addLabel="Add asset"
            />
            <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Starter funds")} />
          </div>

          <StateFormEditor
            label="Wallet rules"
            helper="Start with the connected wallet as an owner, then add recovery contacts or scheduled payments only when this wallet needs them."
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
          <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Wallet rules")} />
          <InlineFieldError
            message={getFirstFieldError(activeFieldErrors, "Wallet with no owner")}
          />
        </div>
      );
}
