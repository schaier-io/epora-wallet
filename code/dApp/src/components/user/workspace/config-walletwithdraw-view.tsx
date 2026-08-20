"use client";
import { walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import {
  isWalletStakingEnabledAtom,
  walletRewardAddressAtom
} from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { useAtomValue } from "jotai";

import {
  ConfigSection,
  LabeledInputField,
  OperatorPathSelector
} from "@/components/user/workspace/editors";
import { getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";
import { useWithdrawForm } from "@/components/user/workspace/forms/use-withdraw-form";
import { formatLovelaceAsAda, parseAdaToLovelace } from "@/lib/units/lovelace";

/**
 * Configuration for `wallet-withdraw` (claim staking rewards).
 *
 * `WorkspaceActionConfigView` had no branch for this action, so the card rendered no fields
 * at all while its own validation demanded a staking address and an amount. The result was a
 * build button that could never be enabled, on a card the sidebar still offered.
 *
 * The reward address is derived from the wallet's own staking script rather than typed: it is
 * not something a user can look up. The field stays editable for the rare case where the
 * rewards sit at a different stake address.
 */
export function WalletWithdrawConfigView() {
  const state = useWorkspaceActions();
  const walletOperatorOptions = useAtomValue(walletOperatorOptionsAtom);
  const walletRewardAddress = useAtomValue(walletRewardAddressAtom);
  const isWalletStakingEnabled = useAtomValue(isWalletStakingEnabledAtom);
  const { activeFieldErrors } = state;
  const { setWalletOperatorPath, walletOperatorPath } = useSttSpendForm();
  const {
    withdrawAmount,
    setWithdrawAmount,
    withdrawRewardAddress,
    setWithdrawRewardAddress
  } = useWithdrawForm();

  const amountAda = formatLovelaceAsAda(withdrawAmount || "0");

  return (
    <div className="space-y-5">
      <ConfigSection
        title="Claim staking rewards"
        description="Moves rewards already earned by this wallet's stake address into the wallet. Everyday rules stay exactly as they are."
      >
        {!isWalletStakingEnabled ? (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Staking is not on for this wallet yet, so it has not earned anything to claim. Turn
            on staking first, then delegate to a pool.
          </div>
        ) : null}
        <OperatorPathSelector
          id="walletWithdrawOperatorPath"
          options={walletOperatorOptions}
          value={walletOperatorPath}
          onChange={setWalletOperatorPath}
        />
      </ConfigSection>

      <LabeledInputField
        id="userWithdrawRewardAddress"
        label="Rewards come from"
        value={withdrawRewardAddress || walletRewardAddress || ""}
        onChange={setWithdrawRewardAddress}
        placeholder="stake_test..."
        error={getFirstFieldError(activeFieldErrors, "Staking address")}
        helper={
          walletRewardAddress && !withdrawRewardAddress
            ? "This wallet's own reward address, worked out from its staking script. Change it only if the rewards you want sit somewhere else."
            : "The stake address the rewards are held at."
        }
      />

      <LabeledInputField
        id="userWithdrawAmount"
        label="Amount to claim (ADA)"
        value={amountAda}
        onChange={(next) => {
          // The builder and the validator both work in lovelace; the person does not.
          // A half-typed amount (`1.`) parses to null — keep the raw text so the field does
          // not fight the user, and let the validator report it.
          setWithdrawAmount(parseAdaToLovelace(next) ?? next.trim());
        }}
        placeholder="1"
        error={getFirstFieldError(activeFieldErrors, "Withdrawal amount")}
        helper="How much of the earned rewards to move into the wallet. The claim fails if this is more than has actually been earned."
      />
    </div>
  );
}
