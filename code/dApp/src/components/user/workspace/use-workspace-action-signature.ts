"use client";
import { useAtomValue } from "jotai";
import type { UserActionKind } from "@/components/user/flow-types";
import { computeActionSignature } from "@/components/user/workspace/workspace-action-signature";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { type useWalletContext } from "@/providers/wallet-provider";
import { type useWorkspaceDetectedTokenDerivations } from "@/components/user/workspace/use-workspace-detected-token-derivations";
import { useMintForm } from "@/components/user/workspace/forms/use-mint-form";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";
import { useWithdrawForm } from "@/components/user/workspace/forms/use-withdraw-form";
import { usePublishForm } from "@/components/user/workspace/forms/use-publish-form";
import { useProposeForm } from "@/components/user/workspace/forms/use-propose-form";
import { useConsolidateForm } from "@/components/user/workspace/forms/use-consolidate-form";
import { useLockFundsForm } from "@/components/user/workspace/forms/use-lock-funds-form";
import { useWalletSpendForm } from "@/components/user/workspace/forms/use-wallet-spend-form";
import { useTransferForm } from "@/components/user/workspace/forms/use-transfer-form";

/**
 * The per-action "signature" builder, extracted from the controller. It self-sources every
 * form (from the atom-backed form hooks) and the config atom, taking only the few non-form
 * derived inputs via ctx, and returns the same `buildActionSignature(action)` the controller
 * used to define inline (used to detect when a built preview is stale vs the selected action).
 */
export interface WorkspaceActionSignatureCtx {
  activePaymentKeyHash: ReturnType<typeof useWalletContext>["activePaymentKeyHash"];
  selectedDetectedToken: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedDetectedToken"];
  selectedDetectedTokenStateForm: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedDetectedTokenStateForm"];
}

export function useWorkspaceActionSignature(ctx: WorkspaceActionSignatureCtx) {
  const { activePaymentKeyHash, selectedDetectedToken, selectedDetectedTokenStateForm } = ctx;
  const config = useAtomValue(configAtom);
  const mintForm = useMintForm();
  const sttForm = useSttSpendForm();
  const withdrawForm = useWithdrawForm();
  const publishForm = usePublishForm();
  const proposeForm = useProposeForm();
  const consolidateForm = useConsolidateForm();
  const lockFundsForm = useLockFundsForm();
  const walletSpendForm = useWalletSpendForm();
  const transferForm = useTransferForm();

  return function buildActionSignature(action: UserActionKind) {
    return computeActionSignature(action, {
      ...mintForm,
      ...sttForm,
      ...withdrawForm,
      ...publishForm,
      ...proposeForm,
      ...consolidateForm,
      ...lockFundsForm,
      ...walletSpendForm,
      ...transferForm,
      activePaymentKeyHash,
      config,
      selectedDetectedToken,
      selectedDetectedTokenStateForm
    });
  };
}
