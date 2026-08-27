"use client";
import { useTranslations } from "next-intl";
import { FIELD_ERROR_IDS } from "@/components/user/workspace/field-error-ids";


import { ConfigSection, DisclosureSection, InlineFieldError, LabeledInputField, RequiredConstrPresetEditor, TransferOutputsEditor } from "@/components/user/workspace/editors";
import { getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useWalletSpendForm } from "@/components/user/workspace/forms/use-wallet-spend-form";

/**
 * Not reachable in the shipped app, and deliberately so. `isUserActionKind`
 * (`components/user/workspace-controller.ts:92-98`) refuses `wallet-spend` as a routable
 * action, and no guided card dispatches it, because a raw wallet spend cannot satisfy the
 * wallet validator: `buildWalletSpendTx` never adds the state token, and `eval_spend` reads
 * one first (`smart-contract/lib/wallet/io.ak:47-57` opens with an unconditional
 * `expect Some(stt_input) = list.find(inputs, ...)`). Nothing here renders for a user, so
 * leave its wording alone until the builder co-spends the token and the action is routed
 * again.
 */
export function WalletSpendConfigView() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigWalletspendView");
  const state = useWorkspaceActions();
  const {
    activeFieldErrors
  } = state;
  const { setWalletSpendInputHash, setWalletSpendInputIndex, setWalletSpendOutputs, setWalletSpendRedeemerPreset, walletSpendInputHash, walletSpendInputIndex, walletSpendOutputs, walletSpendRedeemerPreset } = useWalletSpendForm();

      return (
        <div className="space-y-4">
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
