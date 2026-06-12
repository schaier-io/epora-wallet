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
 * on unmount. Display + cleanup only; no signing. A hook (owns useEffect), called once.
 */
export interface WorkspacePostSubmitEffectsCtx {
  mintCelebrationRef: MutableRefObject<string | null>;
  mintConfirmation: MintConfirmationState | null;
  mintStateForm: StateFormState;
  mintedWalletName: string;
  postSubmitRefreshTimersRef: MutableRefObject<number[]>;
  setMintCelebration: Dispatch<SetStateAction<MintCelebration | null>>;
}

export function useWorkspacePostSubmitEffects(ctx: WorkspacePostSubmitEffectsCtx): void {
  const {
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

  useEffect(
    () => () => {
      postSubmitRefreshTimersRef.current.forEach((id) => window.clearTimeout(id));
    },
    [postSubmitRefreshTimersRef]
  );
}
