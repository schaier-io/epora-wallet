"use client";
import { useTranslations } from "next-intl";

import { walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import {
  isWalletStakingEnabledAtom,
  walletRewardAddressAtom
} from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { useAtomValue } from "jotai";

import { Button } from "@/components/ui/button";
import {
  ConfigSection,
  LabeledField,
  LabeledInputField,
  OperatorPathSelector
} from "@/components/user/workspace/editors";
import { AdaAmountInput } from "@/components/user/workspace/editors/ada-amount-input";
import { getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";
import { useWithdrawForm } from "@/components/user/workspace/forms/use-withdraw-form";

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
  const i18n = useTranslations("ComponentsUserWorkspaceConfigWalletwithdrawView");
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

      {/* Not "Claim staking rewards": the card above this view is titled "Claim staking
          rewards details" and describes the action three more times (routeExplanation,
          outcome, and the "What this does" panel). This names what the section holds, and
          says in plain words what its "Authorization Path" label means. */}
      <ConfigSection title={i18n("whoApprovesThisClaim")}>
        <OperatorPathSelector
          id="walletWithdrawOperatorPath"
          options={walletOperatorOptions}
          value={walletOperatorPath}
          onChange={setWalletOperatorPath}
        />
      </ConfigSection>

      <LabeledInputField
        id="userWithdrawRewardAddress"
        label={i18n("rewardsComeFrom")}
        value={withdrawRewardAddress || walletRewardAddress || ""}
        onChange={setWithdrawRewardAddress}
        placeholder={i18n("stakeTest")}
        error={getFirstFieldError(activeFieldErrors, "Staking address")}
        helper={
          walletRewardAddress && !withdrawRewardAddress
            ? i18n("thisWalletSOwnRewardAddressWorkedOut")
            : i18n("theStakeAddressTheRewardsAreHeldAt")
        }
      />

      {/* The builder and the validator both work in lovelace; the person does not.
          `AdaAmountInput` keeps what was typed, so a decimal point survives the
          keystroke after it, and only a complete amount reaches the draft. */}
      <LabeledField
        htmlFor="userWithdrawAmount"
        label={i18n("amountToClaimAda")}
        error={getFirstFieldError(activeFieldErrors, "Withdrawal amount")}
        helper={i18n("howMuchOfTheEarnedRewardsToMove")}
      >
        <AdaAmountInput
          id="userWithdrawAmount"
          value={withdrawAmount}
          onChange={setWithdrawAmount}
          placeholder="1"
        />
      </LabeledField>
    </div>
  );
}
