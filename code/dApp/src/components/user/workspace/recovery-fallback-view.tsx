"use client";
import { useAtomValue } from "jotai";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { currentRecoveryCapacityFailureAtom } from "./atoms/recovery-capacity.atoms";
import { useBeneficiaryPreparationNavigation } from "./use-beneficiary-preparation-navigation";
import { useWorkspaceActions } from "./workspace-actions-context";

export function RecoveryFallbackView() {
  const i18n = useTranslations("ComponentsUserWorkspaceRecoveryFallbackView");
  const failure = useAtomValue(currentRecoveryCapacityFailureAtom);
  const prepare = useBeneficiaryPreparationNavigation();
  const { openWorkspaceIntent } = useWorkspaceActions();
  if (!failure) return null;
  return <section role="status" className="space-y-3 rounded-lg border border-amber-500/40 p-3">
    <p className="font-medium">{i18n("title")}</p>
    <p className="text-sm text-muted-foreground">{i18n("description")}</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" onClick={prepare}>{i18n("prepare")}</Button>
      <Button type="button" variant="outline" onClick={() => openWorkspaceIntent("send", "distribute-beneficiaries")}>{i18n("distribute")}</Button>
    </div>
  </section>;
}
