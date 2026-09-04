"use client";
import { useTranslations } from "next-intl";

import {
  isWalletStakingEnabledAtom,
  walletRewardAddressAtom
} from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { useAtomValue } from "jotai";

import { Button } from "@/components/ui/button";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useWithdrawForm } from "@/components/user/workspace/forms/use-withdraw-form";
import { useStakingRewards } from "@/components/user/workspace/use-staking-rewards";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";

/**
 * Configuration for `wallet-withdraw` (claim staking rewards).
 *
 * `WorkspaceActionConfigView` had no branch for this action, so the card rendered no fields
 * at all while its own validation demanded a staking address and an amount. The result was a
 * build button that could never be enabled, on a card the sidebar still offered.
 *
 * The reward address comes from the wallet's staking script. The claim amount comes from the
 * chain because Cardano withdrawals must use the full available reward balance.
 */
export function WalletWithdrawConfigView() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigWalletwithdrawView");
  const state = useWorkspaceActions();
  const walletRewardAddress = useAtomValue(walletRewardAddressAtom);
  const isWalletStakingEnabled = useAtomValue(isWalletStakingEnabledAtom);
  const { openWorkspaceIntent } = state;
  const { withdrawAmount, setWithdrawAmount, setWithdrawRewardAddress } = useWithdrawForm();
  const rewards = useStakingRewards(
    walletRewardAddress,
    isWalletStakingEnabled,
    withdrawAmount,
    setWithdrawAmount,
    setWithdrawRewardAddress
  );
  const hasRewards = /^\d+$/.test(rewards.rewardsLovelace)
    && BigInt(rewards.rewardsLovelace) > 0n;

  return (
    <div className="space-y-4">
      {!isWalletStakingEnabled ? (
        // Out of the section below and given a control. The old copy told the reader to turn
        // on staking on a screen that had no way to do it, and the review rail states the same
        // blocker three more times; this is the one place that can act on it.
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p className="leading-relaxed">
            {i18n("stakingIsOffForThisWalletSoIt")}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() =>
              openWorkspaceIntent("enable-staking", "set-intended-stake-credential")
            }
          >
            {i18n("turnOnStaking")}
          </Button>
        </div>
      ) : null}

      {isWalletStakingEnabled ? (
        <div className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
          {rewards.loading ? (
            <p className="text-sm text-muted-foreground">
              {i18n("checkingAvailableStakingRewards")}
            </p>
          ) : !walletRewardAddress ? (
            <p className="text-sm text-amber-100">
              {i18n("couldNotDeriveThisWalletSRewardAddress")}
            </p>
          ) : rewards.error ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-amber-100">{i18n("couldNotLoadStakingRewards")}</p>
              <Button type="button" size="sm" variant="outline" onClick={rewards.refresh}>
                {i18n("checkAgain")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="eyebrow text-muted-foreground">{i18n("availableToClaim")}</p>
                {hasRewards ? (
                  <>
                    <p className="mt-1 text-2xl font-semibold text-foreground">
                      {i18n("value1AdaAvailableToClaim", {
                        value1: formatLovelaceAsAda(rewards.rewardsLovelace)
                      })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {i18n("theClaimWillCollectTheFullAvailableReward")}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {i18n("noStakingRewardsAreAvailableToClaim")}
                  </p>
                )}
              </div>

              <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="eyebrow text-muted-foreground">{i18n("rewardAddress")}</dt>
                  <dd className="mt-1 break-all font-mono text-foreground">
                    {walletRewardAddress}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow text-muted-foreground">{i18n("stakePool")}</dt>
                  <dd className="mt-1 break-all font-mono text-foreground">
                    {rewards.active && rewards.poolId
                      ? rewards.poolId
                      : i18n("thisWalletIsNotDelegatedToAStake")}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
