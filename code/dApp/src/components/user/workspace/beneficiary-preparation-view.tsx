"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { GuidedLockedUtxoSelector } from "./editors/guided-fields";
import { AssetListEditor } from "./editors/asset-list-editor";
import { formatAmountSummary } from "./helpers";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import { useBeneficiaryPreparation } from "./use-beneficiary-preparation";

export function BeneficiaryPreparationView() {
  const i18n = useTranslations("ComponentsUserWorkspaceBeneficiaryPreparationView");
  const model = useBeneficiaryPreparation();
  const plan = model.plan;
  return <section className="space-y-4 rounded-lg border border-border/60 p-4" aria-label={i18n("title")}>
    <h3 className="font-medium">{i18n("title")}</h3>
    <p className="text-sm text-muted-foreground">{i18n("description")}</p>
    <p className="text-xs text-muted-foreground">{i18n("rights")}</p>
    <p className="text-xs text-muted-foreground">{i18n("funding")}</p>
    <GuidedLockedUtxoSelector utxos={model.utxos} selectedRefs={model.selectedRefs} onChange={model.setSelectedRefs} helper={i18n("selection")} error={model.discoveryError} onRefresh={model.refresh} />
    <AssetListEditor label={i18n("assets")} helper={i18n("assetsHelp")} value={model.poolAssets} onChange={model.setPoolAssets} availableAssets={model.selectedAmount} />
    {model.loading ? <p role="status">{i18n("loading")}</p> : null}
    {model.error ? <p role="status" className="text-sm text-amber-700 dark:text-amber-200">{model.error}</p> : null}
    {plan ? <>
      {!plan.pool ? <p className="text-sm">{i18n("merge")}</p> : null}
      <p className="break-all text-xs text-muted-foreground">{model.walletAddress}</p>
      {(plan.pool ? [{ label: i18n("pool"), amount: plan.pool }, { label: i18n("remainder"), amount: plan.remainder }] : [{ label: i18n("merged"), amount: plan.remainder }]).filter(row => row.amount.length > 0).map(row => <div key={row.label} className="space-y-2 rounded-md border p-3">
        <h4 className="font-medium">{row.label}</h4>
        <ul className="space-y-2">{row.amount.map(asset => <li key={asset.unit} className="break-all text-sm"><p>{formatAmountSummary([asset])}</p>{asset.unit !== "lovelace" ? <p className="text-xs text-muted-foreground">{asset.unit}</p> : null}</li>)}</ul>
      </div>)}
      {plan.depositShortfall > 0n ? <p role="status">{i18n("deposit", { amount: formatLovelaceAsAda(plan.depositShortfall) })}</p> : !plan.isReady && plan.pool ? <div className="space-y-2" role="status">
        <p>{i18n("allocation")}</p>
        <p className="text-sm">{i18n("minimums", { pool: formatLovelaceAsAda(plan.minimumPoolLovelace), remainder: formatLovelaceAsAda(plan.minimumRemainderLovelace) })}</p>
        {plan.suggestedPoolLovelace !== null ? <Button type="button" variant="secondary" onClick={model.correctAda}>{i18n("useMinimum", { amount: formatLovelaceAsAda(plan.suggestedPoolLovelace) })}</Button> : null}
      </div> : null}
    </> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={model.refresh}>{i18n("refresh")}</Button>
      {plan && plan.depositShortfall > 0n ? <Button type="button" variant="secondary" onClick={model.addFunds}>{i18n("addFunds")}</Button> : null}
      <Button type="button" variant="outline" onClick={model.distribute}>{i18n("distribute")}</Button>
      <Button type="button" variant="outline" onClick={model.finish}>{i18n("finish")}</Button>
    </div>
  </section>;
}
