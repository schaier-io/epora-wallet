"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { GuidedLockedUtxoSelector } from "./editors/guided-fields";
import { formatAmountSummary } from "./helpers";
import { useBeneficiaryDistribution } from "./use-beneficiary-distribution";

export function BeneficiaryDistributionView() {
  const i18n = useTranslations("ComponentsUserWorkspaceBeneficiaryDistributionView");
  const model = useBeneficiaryDistribution();
  return <section className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4" aria-label={i18n("title")}>
    <h3 className="font-medium">{i18n("title")}</h3>
    <p className="text-sm text-muted-foreground">{i18n("description")}</p>
    <p className="text-xs text-muted-foreground">{i18n("rights")}</p>
    <p className="text-xs text-muted-foreground">{i18n("scriptDatum")}</p>
    <p className="text-xs text-muted-foreground">{i18n("funding")}</p>
    <p className="text-xs text-muted-foreground">{i18n("topups")}</p>
    {model.loading ? <p role="status">{i18n("loading")}</p> : null}
    <GuidedLockedUtxoSelector utxos={model.utxos} selectedRefs={model.selectedRefs}
      onChange={model.setSelectedRefs} selectionMode="single" helper={i18n("picker")}
      error={model.discoveryError} onRefresh={model.refreshFunds} />
    {model.error ? <p role="status" className="text-sm text-amber-700 dark:text-amber-200">{model.error}</p> : null}
    {model.details?.payouts.map((payout) => <div key={String(payout.beneficiaryId)} className="space-y-2 rounded-md border border-border/60 p-3">
      <p className="font-medium">{i18n("recipient", { id: String(payout.beneficiaryId) })}</p>
      <p className="text-xs">{i18n("share", { weight: String(payout.weight), total: String(model.details!.totalWeight) })}</p>
      <p className="break-all text-xs text-muted-foreground">{payout.address}</p>
      <ul className="space-y-2">{payout.amount.map((asset) => <li key={asset.unit} className="break-all text-sm">
        <p>{formatAmountSummary([asset])}</p>
        {asset.unit !== "lovelace" ? <p className="text-xs text-muted-foreground">{asset.unit}</p> : null}
      </li>)}</ul>
    </div>)}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" onClick={model.prepare}>{i18n("prepare")}</Button>
      <Button type="button" variant="outline" onClick={model.refreshTime}>{i18n("refreshTime")}</Button>
      {model.refreshFunds ? <Button type="button" variant="outline" onClick={model.refreshFunds} disabled={model.loading}>{i18n("refreshFunds")}</Button> : null}
      {model.hasStreams ? <>
        <Button type="button" variant="secondary" onClick={model.stopStreams}>{i18n("stopStreams")}</Button>
        <Button type="button" variant="secondary" onClick={model.settle}>{i18n("settle")}</Button>
      </> : null}
    </div>
  </section>;
}
