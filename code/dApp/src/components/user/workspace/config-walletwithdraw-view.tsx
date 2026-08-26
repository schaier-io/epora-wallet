"use client";
import { walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import {
  isWalletStakingEnabledAtom,
  walletRewardAddressAtom
} from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { useAtomValue } from "jotai";

import { Button } from "@/components/ui/button";
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
  const { activeFieldErrors, openWorkspaceIntent } = state;
  const { setWalletOperatorPath, walletOperatorPath } = useSttSpendForm();
  const {
    withdrawAmount,
    setWithdrawAmount,
    withdrawRewardAddress,
    setWithdrawRewardAddress
  } = useWithdrawForm();

  const amountAda = formatLovelaceAsAda(withdrawAmount || "0");

  return (
    <div className="space-y-4">
      {!isWalletStakingEnabled ? (
        // Out of the section below and given a control. The old copy told the reader to turn
        // on staking on a screen that had no way to do it, and the review rail states the same
        // blocker three more times; this is the one place that can act on it.
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p className="leading-relaxed">
            Staking is off for this wallet, so it has earned nothing to claim. Turn it on, then
            choose a pool.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() =>
              openWorkspaceIntent("enable-staking", "set-intended-stake-credential")
            }
          >
            Turn on staking
          </Button>
        </div>
      ) : null}

      {/* Not "Claim staking rewards": the card above this view is titled "Claim staking
          rewards details" and describes the action three more times (routeExplanation,
          outcome, and the "What this does" panel). This names what the section holds, and
          says in plain words what its "Authorization Path" label means. */}
      <ConfigSection title="Who approves this claim">
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
