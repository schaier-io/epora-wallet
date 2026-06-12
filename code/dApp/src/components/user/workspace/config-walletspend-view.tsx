"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { DisclosureSection, InlineFieldError, RequiredConstrPresetEditor, TransferOutputsEditor } from "@/components/user/workspace/editors";
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
          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <p className="text-sm font-medium text-foreground">Wallet script context</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use the parameterized wallet script input you want to spend, then define one or more structured outputs.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="userWalletSpendHash">Wallet Input Tx Hash</Label>
              <Input
                id="userWalletSpendHash"
                value={walletSpendInputHash}
                onChange={(event) => setWalletSpendInputHash(event.target.value)}
              />
              <InlineFieldError
                message={getFirstFieldError(activeFieldErrors, "Wallet input tx hash")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="userWalletSpendIndex">Wallet Input Index (optional)</Label>
              <Input
                id="userWalletSpendIndex"
                value={walletSpendInputIndex}
                onChange={(event) => setWalletSpendInputIndex(event.target.value)}
              />
              <InlineFieldError
                message={getFirstFieldError(activeFieldErrors, "Wallet input index")}
              />
            </div>
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
