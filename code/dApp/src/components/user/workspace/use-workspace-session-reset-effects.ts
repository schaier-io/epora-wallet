"use client";
import { useWorkspaceRouteState } from "@/components/user/use-workspace-controller";
import { connectStepPinnedAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { useAtomValue } from "jotai";

import { useEffect } from "react";

import {
  DEFAULT_WORKSPACE_ROUTE_STATE } from "@/components/user/workspace-controller";

import { type useWalletContext } from "@/providers/wallet-provider";

import { type MutableRefObject } from "react";

/**
 * The wallet-session reset effect, extracted from the controller hook. When the connected
 * wallet / address / network changes (a new session key), it clears any stale build messages
 * and preview and resets the route to a clean state so the new wallet starts fresh. Build/route
 * display state only; no signing. A hook (owns useEffect), called once from the controller.
 */
export interface WorkspaceSessionResetEffectsCtx {
  activeAddress: ReturnType<typeof useWalletContext>["activeAddress"];
  activeWalletName: ReturnType<typeof useWalletContext>["activeWalletName"];
  clearBuildMessages: () => void;
  clearPreviewResult: () => void;
  networkId: ReturnType<typeof useWalletContext>["networkId"];
  walletReady: boolean;
  walletSessionKeyRef: MutableRefObject<string | null>;
}

/** The session key while no wallet is connected: every part of it is empty. */
const DISCONNECTED_WALLET_SESSION_KEY = "||";

export function useWorkspaceSessionResetEffects(ctx: WorkspaceSessionResetEffectsCtx): void {
  const {
    activeAddress,
    activeWalletName,
    clearBuildMessages,
    clearPreviewResult,
    networkId,
    walletReady,
    walletSessionKeyRef
  } = ctx;
  const { commitRouteState } = useWorkspaceRouteState();
  const connectStepPinned = useAtomValue(connectStepPinnedAtom);

  useEffect(() => {
    const walletSessionKey = `${activeWalletName ?? ""}|${activeAddress ?? ""}|${networkId ?? ""}`;

    if (walletSessionKeyRef.current === null) {
      walletSessionKeyRef.current = walletSessionKey;
      return;
    }

    if (walletSessionKeyRef.current !== walletSessionKey) {
      // Going from "nothing connected" to a wallet is a connect, not a switch. Resetting
      // there wiped `?action=`, `?task=` and `?step=` off every deep link a moment after the
      // page loaded, because the key starts empty and only fills in once the wallet answers.
      // A real switch still resets: its disconnect leg (a real key -> the empty one) does it.
      const wasDisconnected = walletSessionKeyRef.current === DISCONNECTED_WALLET_SESSION_KEY;
      walletSessionKeyRef.current = walletSessionKey;

      if (!wasDisconnected) {
        commitRouteState(DEFAULT_WORKSPACE_ROUTE_STATE);
        clearBuildMessages();
        clearPreviewResult();
      }
      return;
    }

    walletSessionKeyRef.current = walletSessionKey;
  }, [
    activeAddress,
    activeWalletName,
    commitRouteState,
    connectStepPinned,
    networkId,
    walletReady,
    clearBuildMessages,
    clearPreviewResult,
    walletSessionKeyRef
  ]);
}
