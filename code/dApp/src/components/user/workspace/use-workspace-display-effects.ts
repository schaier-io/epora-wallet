"use client";
import { useSetAtom } from "jotai";
import { walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { useEffect } from "react";

import { type useWorkspaceDetectedTokenDerivations } from "@/components/user/workspace/use-workspace-detected-token-derivations";
import { type useWorkspacePermissionWalletCards } from "@/components/user/workspace/use-workspace-permission-wallet-cards";

/**
 * The wallet-display sync effects, extracted from the controller hook. They keep the
 * smart-wallet display in sync with the selected permission-wallet card / detected token
 * (publish the active card, reset on deselect) and surface the connection dialog when needed.
 * UI display only; no signing. A hook (owns useEffect), called once from the controller.
 */
export interface WorkspaceDisplayEffectsCtx {
  permissionWalletCards: ReturnType<typeof useWorkspacePermissionWalletCards>["permissionWalletCards"];
  selectedDetectedToken: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedDetectedToken"];
  selectedPermissionWalletCard: ReturnType<typeof useWorkspacePermissionWalletCards>["selectedPermissionWalletCard"];
  smartWalletDisplayPublish: ReturnType<typeof useWorkspacePermissionWalletCards>["smartWalletDisplayPublish"];
  smartWalletDisplayReset: ReturnType<typeof useWorkspacePermissionWalletCards>["smartWalletDisplayReset"];
}

export function useWorkspaceDisplayEffects(ctx: WorkspaceDisplayEffectsCtx): void {
  const {
    permissionWalletCards,
    selectedDetectedToken,
    selectedPermissionWalletCard,
    smartWalletDisplayPublish,
    smartWalletDisplayReset
  } = ctx;
  const setWalletConnectionDialogOpen = useSetAtom(walletConnectionDialogOpenAtom);

  useEffect(() => {
    if (!selectedDetectedToken) {
      smartWalletDisplayPublish({
        name: null,
        alternativeCount: 0,
        onSwitch: null,
        identitySeed: null
      });
      return;
    }
    const seed = selectedDetectedToken.utxo.input.txHash
      ? `${selectedDetectedToken.utxo.input.txHash}#${selectedDetectedToken.utxo.input.outputIndex}`
      : null;
    smartWalletDisplayPublish({
      name: selectedPermissionWalletCard?.primaryLabel ?? null,
      alternativeCount: permissionWalletCards.length,
      identitySeed: seed,
      onSwitch: () => {
        setWalletConnectionDialogOpen(true);
      }
    });
  }, [
    permissionWalletCards.length,
    selectedDetectedToken,
    selectedPermissionWalletCard?.primaryLabel,
    smartWalletDisplayPublish,
    setWalletConnectionDialogOpen
  ]);

  useEffect(() => {
    return () => smartWalletDisplayReset();
  }, [smartWalletDisplayReset]);
}
