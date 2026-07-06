"use client";

import { ConfigSection, DisclosureSection, InlineFieldError, LabeledInputField, RequiredConstrPresetEditor, TransferOutputsEditor } from "@/components/user/workspace/editors";
import { getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useWalletSpendForm } from "@/components/user/workspace/forms/use-wallet-spend-form";

export function WalletSpendConfigView() {
  const state = useWorkspaceActions();
  const {
    activeFieldErrors
  } = state;
  const { setWalletSpendInputHash, setWalletSpendInputIndex, setWalletSpendOutputs, setWalletSpendRedeemerPreset, walletSpendInputHash, walletSpendInputIndex, walletSpendOutputs, walletSpendRedeemerPreset } = useWalletSpendForm();

      return (
        <div className="space-y-5">
          <ConfigSection
            title="Wallet script context"
            description="Use the parameterized wallet script input you want to spend, then define one or more structured outputs."
          />
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
