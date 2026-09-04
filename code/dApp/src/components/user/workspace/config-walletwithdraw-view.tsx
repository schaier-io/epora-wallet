"use client";
import { useTranslations } from "next-intl";

import {
  isWalletStakingEnabledAtom,
  walletRewardAddressAtom
} from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  LabeledInputField
} from "@/components/user/workspace/editors";
import { getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
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
  const i18n = useTranslations("ComponentsUserWorkspaceConfigWalletwithdrawView");
  const state = useWorkspaceActions();
  const walletRewardAddress = useAtomValue(walletRewardAddressAtom);
  const isWalletStakingEnabled = useAtomValue(isWalletStakingEnabledAtom);
  const { activeFieldErrors, openWorkspaceIntent } = state;
  const {
    withdrawAmount,
    setWithdrawAmount,
    withdrawRewardAddress,
    setWithdrawRewardAddress
  } = useWithdrawForm();

  /**
   * The text the person is typing, kept as text.
   *
   * The field used to render `formatLovelaceAsAda(withdrawAmount)` and parse it back on every
   * keystroke. That round-trip cannot survive a decimal point: `parseAdaToLovelace("1.")`
   * returns "1000000" (its pattern allows a trailing dot), and `formatLovelaceAsAda` strips
   * the trailing zeros back to "1", so React reset the box and erased the dot as it was
   * typed. The next digit then landed against the whole number: entering 1.5 staged 15 ADA,
   * silently, on a claim. Holding the raw text is the same thing the send flow does with
   * `transferDisplayAmount`.
   */
  const [amountText, setAmountText] = useState(() =>
    withdrawAmount ? formatLovelaceAsAda(withdrawAmount) : ""
  );

  // Re-seed only when the draft is replaced from OUTSIDE this box: Clear form, Reload
  // defaults, a wallet switch. Comparing the box against the draft instead would re-seed the
  // moment the box holds no complete amount, which is exactly what an empty box is, so
  // clearing the field would undo itself on the next render.
  const lastPushedRef = useRef(withdrawAmount);
  useEffect(() => {
    if (withdrawAmount !== lastPushedRef.current) {
      lastPushedRef.current = withdrawAmount;
      setAmountText(withdrawAmount ? formatLovelaceAsAda(withdrawAmount) : "");
    }
  }, [withdrawAmount]);

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

      <LabeledInputField
        id="userWithdrawAmount"
        label={i18n("amountToClaimAda")}
        value={amountText}
        onChange={(next) => {
          // The builder and the validator both work in lovelace; the person does not. The box
          // keeps what was typed; only a complete amount reaches the draft, and a half-typed
          // one leaves the last good value there for the validator to report against.
          setAmountText(next);
          const asLovelace = parseAdaToLovelace(next);
          if (asLovelace !== null) {
            lastPushedRef.current = asLovelace;
            setWithdrawAmount(asLovelace);
          }
        }}
        placeholder="1"
        error={getFirstFieldError(activeFieldErrors, "Withdrawal amount")}
        helper={i18n("howMuchOfTheEarnedRewardsToMove")}
      />
    </div>
  );
}
