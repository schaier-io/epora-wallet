"use client";
import { walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { isWalletStakingEnabledAtom, walletStakingBaseAddressAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { useAtomValue } from "jotai";

import { PoolFinder } from "@/components/user/pool-finder";

import { ConfigSection, OperatorPathSelector } from "@/components/user/workspace/editors";

import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";
import { useWithdrawForm } from "@/components/user/workspace/forms/use-withdraw-form";

export function SetIntendedStakeCredentialConfigView() {
  const isWalletStakingEnabled = useAtomValue(isWalletStakingEnabledAtom);
  const walletOperatorOptions = useAtomValue(walletOperatorOptionsAtom);
  const walletStakingBaseAddress = useAtomValue(walletStakingBaseAddressAtom);
  const { setWalletOperatorPath, walletOperatorPath } = useSttSpendForm();
  const { selectedStakePool, setSelectedStakePool } = useWithdrawForm();

      return (
        <div className="space-y-4">
          {/* Not "Enable staking": that is the card's own title one line above
              (`action-definitions.ts` label + " details"), and the card describes the action
              twice more before this section starts. "enterprise address" and "records the
              wallet's own on-chain script as its stake address" were the contract's words,
              not the reader's. */}
          <ConfigSection
            title="What turning it on does"
            description="This wallet cannot earn staking rewards yet. Turning staking on gives it a staking address of its own. No new keys, and only an owner can change it later."
          >
            {isWalletStakingEnabled ? (
              <div className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                Staking is already on for this wallet. Sending this again changes nothing.
              </div>
            ) : null}
            {walletStakingBaseAddress ? (
              <div className="mt-3 space-y-1">
                {/* Not "New staking address": this block renders in the already-on state too,
                    where the address is not new. */}
                <p className="eyebrow text-muted-foreground">
                  Staking address
                </p>
                <p className="break-all font-mono text-xs text-foreground">
                  {walletStakingBaseAddress}
                </p>
              </div>
            ) : null}
            {/* The old line sent the reader to the wallet home for a step the app offers by
                itself: `StakeAddressDiscoveryPanel` (`workspace-sidebar-view.tsx:242`) renders
                on every workspace screen and puts a "Move it back" button in front of them. It
                also said "then delegate to a pool below", and nothing below delegates. */}
            <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              After this confirms, the wallet&apos;s existing funds still sit at the old address.
              The app will offer to move them, and that takes one more signature.
            </div>
            <OperatorPathSelector
              id="setStakeCredentialOperatorPath"
              options={walletOperatorOptions}
              value={walletOperatorPath}
              onChange={setWalletOperatorPath}
            />
          </ConfigSection>
          {/* rounded-lg, not rounded-xl: this panel sits inside the config <Card>, which is
              itself rounded-xl, so it read as a peer of the card rather than a child. */}
          <div className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
            {/* `selectedStakePool` is written here and read by nothing: no builder, receipt or
                validation consumes it, and there is no delegation transaction in the app at
                all. So the old heading, "Pick a pool to delegate to (optional)", named an
                outcome the app cannot produce. */}
            <p className="text-sm font-medium text-foreground">Browse stake pools</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nothing is sent when you pick one: this app cannot delegate yet.
            </p>
            <div className="mt-3">
              <PoolFinder selectedPool={selectedStakePool} onSelect={setSelectedStakePool} />
            </div>
          </div>
        </div>
      );
}
