"use client";

import { atom } from "jotai";
import type { OperatorAuthorityPath } from "@/lib/types/contracts";
import {
  computeSttAuthorityOptions,
  computeWalletOperatorOptions
} from "@/components/user/workspace/workspace-stt-option-derivations";
import { STT_SPEND_ACTION_TABS } from "@/components/user/workspace/constants";
import { effectiveSttActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { selectedTokenCapabilityMapAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";

/**
 * The STT-spend action tab + the authority/operator option sets, as derived atoms over the
 * effective STT action and the selected token's capability map. Converted from the controller's
 * memos so the editors/views read them directly.
 */
export const activeSttActionTabAtom = atom((get) => {
  const action = get(effectiveSttActionAtom);
  return STT_SPEND_ACTION_TABS.find((tab) => tab.value === action) ?? STT_SPEND_ACTION_TABS[0];
});

export const activeSttAuthorityOptionsAtom = atom((get) =>
  computeSttAuthorityOptions(get(effectiveSttActionAtom), get(selectedTokenCapabilityMapAtom))
);

export const walletOperatorOptionsAtom = atom<Array<{ value: OperatorAuthorityPath; label: string }>>(
  (get) => computeWalletOperatorOptions(get(selectedTokenCapabilityMapAtom))
);
