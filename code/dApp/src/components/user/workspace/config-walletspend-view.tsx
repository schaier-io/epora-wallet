"use client";

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
  const state = useWorkspaceActions();
  const {
    activeFieldErrors
  } = state;
  const { setWalletSpendInputHash, setWalletSpendInputIndex, setWalletSpendOutputs, setWalletSpendRedeemerPreset, walletSpendInputHash, walletSpendInputIndex, walletSpendOutputs, walletSpendRedeemerPreset } = useWalletSpendForm();

      return (
        <div className="space-y-4">
          <ConfigSection
            title="Wallet script context"
            description="Use the parameterized wallet script input you want to spend, then define one or more structured outputs."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <LabeledInputField
                id="userWalletSpendHash"
                label="Wallet Input Tx Hash"
                value={walletSpendInputHash}
                onChange={setWalletSpendInputHash}
                error={getFirstFieldError(activeFieldErrors, "Wallet input tx hash")}
              />
              <LabeledInputField
                id="userWalletSpendIndex"
                label="Wallet Input Index (optional)"
                value={walletSpendInputIndex}
                onChange={setWalletSpendInputIndex}
                error={getFirstFieldError(activeFieldErrors, "Wallet input index")}
              />
            </div>
          </ConfigSection>
          <TransferOutputsEditor
            label="Outputs"
            helper="Add one or more payout outputs with assets and optional inline datum presets."
            value={walletSpendOutputs}
            onChange={setWalletSpendOutputs}
          />
          <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Outputs")} />
          <DisclosureSection
            title="Advanced options"
            description="Switch the redeemer only when the default empty constructor is not the one you need."
          >
            <RequiredConstrPresetEditor
              label="Redeemer"
              helper="The default is the empty constructor with alternative 0."
              value={walletSpendRedeemerPreset}
              onChange={setWalletSpendRedeemerPreset}
            />
            <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Wallet spend")} />
          </DisclosureSection>
        </div>
      );
}
