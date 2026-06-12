"use client";

import { useAtom } from "jotai";
import { useRef } from "react";
import { mintReferenceAtom, mintStateFormAtom, mintStarterAssetsAtom, mintZeroAdminConfirmedAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";

import type { WalletInputRef } from "@/lib/types/contracts";
import { createDefaultStateForm, type StateFormState } from "@/lib/contracts/state-form";

/**
 * Form state for the mint (create-wallet) action: reference name, the initial datum state-form, starter assets, and the auto-mint tracking refs.
 */
export function useMintForm() {
  const [mintReference, setMintReference] = useAtom(mintReferenceAtom);
  const [mintStateForm, setMintStateForm] = useAtom(mintStateFormAtom);
  const [mintStarterAssets, setMintStarterAssets] = useAtom(mintStarterAssetsAtom);
  const previousAutoMintStateRef = useRef<StateFormState>(createDefaultStateForm());
  // Orphan UTxOs queued for the next "move to my wallet address" consolidation,
  // read by the consolidate flow initializer so the prefill survives navigation.
  const pendingOrphanWalletInputsRef = useRef<WalletInputRef[] | null>(null);
  const [mintZeroAdminConfirmed, setMintZeroAdminConfirmed] = useAtom(mintZeroAdminConfirmedAtom);

  return {
    mintReference,
    setMintReference,
    mintStateForm,
    setMintStateForm,
    mintStarterAssets,
    setMintStarterAssets,
    previousAutoMintStateRef,
    pendingOrphanWalletInputsRef,
    mintZeroAdminConfirmed,
    setMintZeroAdminConfirmed
  };
}
