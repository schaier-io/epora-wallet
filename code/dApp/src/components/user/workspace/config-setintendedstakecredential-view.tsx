"use client";
import { walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { isWalletStakingEnabledAtom, walletStakingBaseAddressAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { useAtomValue } from "jotai";

import { Label } from "@/components/ui/label";

import { PoolFinder } from "@/components/user/pool-finder";

import {
  type OperatorAuthorityPath } from "@/lib/types/contracts";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";
import { useWithdrawForm } from "@/components/user/workspace/forms/use-withdraw-form";

export function SetIntendedStakeCredentialConfigView() {
  const state = useWorkspaceActions();
  const isWalletStakingEnabled = useAtomValue(isWalletStakingEnabledAtom);
  const walletOperatorOptions = useAtomValue(walletOperatorOptionsAtom);
  const walletStakingBaseAddress = useAtomValue(walletStakingBaseAddressAtom);
  const {
  } = state;
  const { setWalletOperatorPath, walletOperatorPath } = useSttSpendForm();
  const { selectedStakePool, setSelectedStakePool } = useWithdrawForm();

      return (
        <div className="space-y-5">
          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <p className="text-sm font-medium text-foreground">Enable staking</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Right now this wallet uses an enterprise address, so its funds can&apos;t earn staking
              rewards. Enabling staking records the wallet&apos;s own on-chain script as its stake
              address — no new keys, and only an admin can change it.
            </p>
            {isWalletStakingEnabled ? (
              <div className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                Staking is already enabled for this wallet. Re-running this is a no-op.
              </div>
            ) : null}
            {walletStakingBaseAddress ? (
              <div className="mt-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  New staking address
                </p>
                <p className="break-all font-mono text-xs text-foreground">
                  {walletStakingBaseAddress}
                </p>
              </div>
            ) : null}
            <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              After this confirms, move the wallet&apos;s existing funds to the new staking address
              (a one-time step from the wallet home), then delegate to a pool below.
            </div>
            {walletOperatorOptions.length > 1 ? (
              <div className="mt-4 max-w-xs space-y-1">
                <Label htmlFor="setStakeCredentialOperatorPath">Authorization Path</Label>
                <select
                  id="setStakeCredentialOperatorPath"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={walletOperatorPath}
                  onChange={(event) =>
                    setWalletOperatorPath(event.target.value as OperatorAuthorityPath)
                  }
                >
                  {walletOperatorOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : walletOperatorOptions[0] ? (
              <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Authorization path:{" "}
                <span className="font-medium text-foreground">
                  {walletOperatorOptions[0].label}
                </span>
              </div>
            ) : null}
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <p className="text-sm font-medium text-foreground">Pick a pool to delegate to (optional)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Choose your stake pool now if you like; delegating happens after your funds are at the
              staking address.
            </p>
            <div className="mt-3">
              <PoolFinder selectedPool={selectedStakePool} onSelect={setSelectedStakePool} />
            </div>
          </div>
        </div>
      );
}
