"use client";

import { atom } from "jotai";
import type { OperatorAuthorityPath } from "@/lib/types/contracts";
import {
  computeSttAuthorityOptions,
  computeWalletOperatorOptions
} from "@/components/user/workspace/workspace-stt-option-derivations";
import { STT_SPEND_ACTION_TABS } from "@/components/user/workspace/stt-spend-action-tabs";
import { effectiveSttActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { selectedTokenCapabilityMapAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { selectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { sttAuthorityPathAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { isSttFlowAction } from "@/components/user/workspace/helpers/action-paths";

/**
 * The STT-spend action tab + the authority/operator option sets, as derived atoms over the
 * effective STT action and the selected token's capability map. Converted from the controller's
 * memos so the editors/views read them directly.
 */
export const activeSttActionTabAtom = atom((get) => {
  const action = get(effectiveSttActionAtom);
  return STT_SPEND_ACTION_TABS.find((tab) => tab.value === action) ?? STT_SPEND_ACTION_TABS[0]!;
});

export const activeSttAuthorityOptionsAtom = atom((get) =>
  computeSttAuthorityOptions(get(effectiveSttActionAtom), get(selectedTokenCapabilityMapAtom))
);

export const walletOperatorOptionsAtom = atom<Array<{ value: OperatorAuthorityPath; label: string }>>(
  (get) => computeWalletOperatorOptions(get(selectedTokenCapabilityMapAtom))
);

/**
 * Whether the selected action could become an approval request.
 *
 * The builder captures a proposal only for the two operator paths on an STT action, and only
 * once the wallet identity is known (`workspace-transactions.ts:262`). This mirrors that rule
 * *before* a build runs, which is the point: the save control used to need a finished preview,
 * and the only control that produced one also signed and broadcast, so a co-signer could not
 * prepare a request without first sending the transaction themselves.
 */
export const canProposeSelectedActionAtom = atom((get) => {
  const action = get(selectedActionAtom);
  if (!isSttFlowAction(action)) {
    return false;
  }
  const path = get(sttAuthorityPathAtom);
  if (path !== "admin" && path !== "multisig") {
    return false;
  }
  return Boolean(get(routeStateAtom).selectedWalletUnit);
});
