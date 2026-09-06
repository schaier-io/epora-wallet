"use client";

import { getSttMintPolicyId } from "@/lib/contracts/blueprint";
import { useEffect } from "react";

import {
  normalizeWalletName } from "@/lib/contracts/state-wallet-name";

import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { type StateFormState } from "@/lib/contracts/state-form";
import { type MintConfirmationState } from "@/components/user/workspace/types";
import { type MintCelebration } from "@/components/user/workspace/atoms/transaction-flow.atoms";

/**
 * The post-submit mint-celebration effects, extracted from the controller hook. When a mint
 * confirmation lands they raise the celebration overlay (deduped via a ref against the
 * just-celebrated wallet unit); a second effect clears any pending post-submit refresh timers
 * when the workspace leaves the wallet they belong to, and on unmount. Display + cleanup only;
 * no signing. A hook (owns useEffect), called once.
 */
export interface WorkspacePostSubmitEffectsCtx {
  lockingContractAddress: string | null;
  mintCelebrationRef: MutableRefObject<string | null>;
  mintConfirmation: MintConfirmationState | null;
  mintStateForm: StateFormState;
  mintedWalletName: string;
  postSubmitRefreshTimersRef: MutableRefObject<number[]>;
  setMintCelebration: Dispatch<SetStateAction<MintCelebration | null>>;
}

export function useWorkspacePostSubmitEffects(ctx: WorkspacePostSubmitEffectsCtx): void {
  const {
    lockingContractAddress,
    mintCelebrationRef,
    mintConfirmation,
    mintStateForm,
    mintedWalletName,
    postSubmitRefreshTimersRef,
    setMintCelebration
  } = ctx;

  useEffect(() => {
    const unit = mintConfirmation?.createdWalletUnit;
    if (mintConfirmation?.phase === "confirmed" && unit && mintCelebrationRef.current !== unit) {
      mintCelebrationRef.current = unit;
      let policyId: string | null = null;
      try {
        policyId = getSttMintPolicyId();
      } catch {
        policyId = null;
      }
      setMintCelebration({
        // Use the submit-time snapshot, not the live form value (which may have
        // auto-incremented during the confirmation refresh). Fall back to the
        // live value only if the snapshot was never set.
        walletName:
          mintedWalletName || normalizeWalletName(mintStateForm.walletName),
        sttPolicyId: policyId,
        createdWalletUnit: unit
      });
    }
  }, [
    mintConfirmation?.phase,
    mintConfirmation?.createdWalletUnit,
    mintStateForm.walletName,
    mintCelebrationRef,
    mintedWalletName,
    setMintCelebration
  ]);

  // The post-submit poll belongs to the wallet it was submitted from: each timer
  // re-reads the locked UTxOs at the address captured when it was scheduled.
  // Opening another wallet goes through history.pushState, so nothing unmounts
  // and the timers survive the switch; the request-id guard in
  // use-locked-contract-utxos.ts then makes the late stale reply the newest one,
  // and the previous wallet's funds land on the new wallet's screen. Clearing on
  // the address is right rather than merely safe: once the workspace has left
  // that wallet, its poll has nothing left to update.
  useEffect(
    () => () => {
      const timers = postSubmitRefreshTimersRef.current;
      postSubmitRefreshTimersRef.current = [];
      timers.forEach((id) => window.clearTimeout(id));
    },
    [lockingContractAddress, postSubmitRefreshTimersRef]
  );
}
