"use client";
import { useTranslations } from "next-intl";

import { effectiveWalletAssetNameHexAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";


import { InfoHint } from "@/components/ui/info-hint";

import { AssetListEditor, InlineFieldError, SetupProgressStepper, StateFormEditor, WalletNameEditor } from "@/components/user/workspace/editors";
import { formatReceiptAmountSummary, getFirstFieldError } from "@/components/user/workspace/helpers";

import { useAtomValue } from "jotai";
import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { useMintForm } from "@/components/user/workspace/forms/use-mint-form";

export function MintConfigView() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigMintView");
  const state = useWorkspaceActions();
  const activePaymentKeyHash = useAtomValue(activePaymentKeyHashAtom);
  const activeAddress = useAtomValue(activeAddressAtom);
  const effectiveWalletAssetNameHex = useAtomValue(effectiveWalletAssetNameHexAtom);
  const config = useAtomValue(configAtom);
  const walletBalanceSummary = useAtomValue(walletBalanceSummaryAtom);
  const {
    activeFieldErrors,
    mintSetupSteps,
  } = state;
  const { mintStarterAssets, mintStateForm, mintZeroAdminConfirmed, setMintStarterAssets, setMintStateForm, setMintZeroAdminConfirmed } = useMintForm();

      return (
        <div className="space-y-4">
          {/* No heading panel here. `UserActionConfigurationCard` already renders a title and
              a description for this action, so a second pair immediately below it said the
              same thing twice. What that pair knew and the card did not (this is one shared
              wallet, and it recovers keys) moved into the card's own description. */}
          <SetupProgressStepper steps={mintSetupSteps} />

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
              moreSettingsCollapsed
            />
            <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Wallet rules")} />
            <InlineFieldError
              message={getFirstFieldError(activeFieldErrors, "Wallet with no owner")}
            />
          </div>
        </div>
      );
}
