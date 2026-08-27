"use client";
import { useTranslations } from "next-intl";
import { FIELD_ERROR_IDS } from "@/components/user/workspace/field-error-ids";


import { ConfigSection, DisclosureSection, InlineFieldError, LabeledInputField, RequiredConstrPresetEditor, TransferOutputsEditor } from "@/components/user/workspace/editors";
import { getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useWalletSpendForm } from "@/components/user/workspace/forms/use-wallet-spend-form";

export function WalletSpendConfigView() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigWalletspendView");
  const state = useWorkspaceActions();
  const {
    activeFieldErrors
  } = state;
  const { setWalletSpendInputHash, setWalletSpendInputIndex, setWalletSpendOutputs, setWalletSpendRedeemerPreset, walletSpendInputHash, walletSpendInputIndex, walletSpendOutputs, walletSpendRedeemerPreset } = useWalletSpendForm();

      return (
        <div className="space-y-5">
          <ConfigSection
            title={i18n("manualWalletSend")}
            description={i18n("identifyTheExactWalletFundPoolToSpend")}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <LabeledInputField
                id="userWalletSpendHash"
                label={i18n("fundPoolTransactionHash")}
                value={walletSpendInputHash}
                onChange={setWalletSpendInputHash}
                error={getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.walletInputTransactionHash)}
              />
              <LabeledInputField
                id="userWalletSpendIndex"
                label={i18n("fundPoolOutputIndexOptional")}
                value={walletSpendInputIndex}
                onChange={setWalletSpendInputIndex}
                error={getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.walletInputIndex)}
              />
            </div>
          </ConfigSection>
          <TransferOutputsEditor
            label={i18n("outputs")}
            helper={i18n("addEachDestinationAndItsAssetsAttachOn")}
            value={walletSpendOutputs}
            onChange={setWalletSpendOutputs}
          />
          <InlineFieldError message={getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.outputs)} />
          <DisclosureSection
            title={i18n("advancedOptions")}
            description={i18n("changeTheContractActionDataOnlyWhenYou")}
          >
            <RequiredConstrPresetEditor
              label={i18n("contractActionData")}
              helper={i18n("theDefaultIsAnEmptyValueUsingConstructor")}
              value={walletSpendRedeemerPreset}
              onChange={setWalletSpendRedeemerPreset}
            />
            <InlineFieldError message={getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.walletSpend)} />
          </DisclosureSection>
        </div>
      );
}
