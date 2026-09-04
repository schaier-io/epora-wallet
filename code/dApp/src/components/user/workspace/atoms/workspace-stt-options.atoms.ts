"use client";

import { atom } from "jotai";
import type { AuthorityPath, OperatorAuthorityPath } from "@/lib/types/contracts";
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
import { activeInferredSttStateFormAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
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
 *
 * On top of that, the request flow only exists where an actor cannot authorize alone: on the
 * multisig path it is the whole point, and on the admin path it is for a connected wallet the
 * admin list does not cover, preparing something for the owners to sign. An OWNER signing the
 * admin path already authorizes the entire action — a request would collect one signature,
 * their own — so the control disappears for them and the direct flow is the only flow.
 */
/**
 * The authorization path the wallet's own rules point at. With no approval rule
 * on, only owners can act and the admin path is the answer. With the rule on, an
 * owner still authorizes alone (the rule adds a way in, it never gates one),
 * while a co-signer holds exactly the power the multisig path exists to collect.
 * The composer applies this automatically; the path select stays as an override.
 */
export const suggestedSttAuthorityPathAtom = atom<AuthorityPath>((get) => {
  const form = get(activeInferredSttStateFormAtom);
  if (form.multiSigThresholdMode !== "some") {
    return "admin";
  }
  const keyHash = get(activePaymentKeyHashAtom)?.toLowerCase() ?? null;
  if (keyHash !== null) {
    const connectedOwnsWallet = form.users.some(
      (user) =>
        user.isAdmin &&
        user.wallets.some((wallet) => wallet.toLowerCase() === keyHash)
    );
    if (connectedOwnsWallet) {
      return "admin";
    }
    const connectedHoldsPower = form.users.some(
      (user) =>
        user.multiSigPowerMode === "some" &&
        (Number.parseInt(user.multiSigPower, 10) || 0) > 0 &&
        user.wallets.some((wallet) => wallet.toLowerCase() === keyHash)
    );
    if (connectedHoldsPower) {
      return "multisig";
    }
  }
  return "admin";
});

export const canProposeSelectedActionAtom = atom((get) => {
  const action = get(selectedActionAtom);
  if (!isSttFlowAction(action)) {
    return false;
  }
  const path = get(sttAuthorityPathAtom);
  if (path !== "admin" && path !== "multisig") {
    return false;
  }
  if (!Boolean(get(routeStateAtom).selectedWalletUnit)) {
    return false;
  }
  if (path === "admin") {
    const keyHash = get(activePaymentKeyHashAtom);
    if (keyHash !== null) {
      const normalized = keyHash.toLowerCase();
      const isConnectedWalletAnAdmin = get(activeInferredSttStateFormAtom).users.some(
        (user) =>
          user.isAdmin &&
          user.wallets.some((wallet) => wallet.toLowerCase() === normalized)
      );
      if (isConnectedWalletAnAdmin) {
        return false;
      }
    }
  }
  return true;
});
