"use client";
import { useTranslations } from "next-intl";

import { walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { isWalletStakingEnabledAtom, walletStakingBaseAddressAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { useAtomValue } from "jotai";

import { PoolFinder } from "@/components/user/pool-finder";

import { ConfigSection, OperatorPathSelector } from "@/components/user/workspace/editors";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";
import { useWithdrawForm } from "@/components/user/workspace/forms/use-withdraw-form";

export function SetIntendedStakeCredentialConfigView() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigSetintendedstakecredentialView");
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
          <ConfigSection
            title={i18n("enableStaking")}
            description={i18n("rightNowThisWalletUsesAnEnterpriseAddress")}
          >
            {isWalletStakingEnabled ? (
              <div className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                {i18n("stakingIsAlreadyEnabledForThisWalletRe")}
              </div>
            ) : null}
            {walletStakingBaseAddress ? (
              <div className="mt-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {i18n("newStakingAddress")}
                </p>
                <p className="break-all font-mono text-xs text-foreground">
                  {walletStakingBaseAddress}
                </p>
              </div>
            ) : null}
            <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {i18n("afterThisConfirmsMoveTheWalletSExisting")}
            </div>
            <OperatorPathSelector
              id="setStakeCredentialOperatorPath"
              options={walletOperatorOptions}
              value={walletOperatorPath}
              onChange={setWalletOperatorPath}
            />
          </ConfigSection>
          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <p className="text-sm font-medium text-foreground">{i18n("pickAPoolToDelegateToOptional")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {i18n("chooseYourStakePoolNowIfYouLike")}
            </p>
            <div className="mt-3">
              <PoolFinder selectedPool={selectedStakePool} onSelect={setSelectedStakePool} />
            </div>
          </div>
        </div>
      );
}
