"use client";
import { useAtomValue } from "jotai";
import { workspaceDraftResetRevisionAtom } from "../atoms/workspace-draft-reset.atoms";
import { selectedDetectedTokenUnitAtom } from "../atoms/workspace-selection.atoms";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { useRef } from "react";
import type { UserFormState } from "@/lib/contracts/state-form";

type Limits = Pick<UserFormState, "perDayAllowance" | "remainingAllowance">;
export function useSpenderPermissionDraft(user: UserFormState, onChange: (value: UserFormState) => void, canAdd: boolean) {
  const walletUnit = useAtomValue(selectedDetectedTokenUnitAtom);
  const signer = useAtomValue(activePaymentKeyHashAtom);
  const resetRevision = useAtomValue(workspaceDraftResetRevisionAtom);
  const key = `${resetRevision}:${walletUnit ?? ""}:${signer ?? ""}:${user.id}`;
  const saved = useRef<{ key: string; limits: Limits } | null>(null);
  return () => {
    const isSpender = user.perDayAllowance.length > 0;
    if (!isSpender && !canAdd) return;
    if (isSpender) {
      saved.current = { key, limits: { perDayAllowance: user.perDayAllowance, remainingAllowance: user.remainingAllowance } };
      onChange({ ...user, preset: "custom", perDayAllowance: [], remainingAllowance: [] });
    } else {
      const limits = saved.current?.key === key ? saved.current.limits : { perDayAllowance: [{ policyId: "", assetName: "", amount: "" }] };
      onChange({ ...user, ...limits, preset: "custom" });
    }
  };
}
