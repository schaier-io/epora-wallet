"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useBeneficiaryStreamStop } from "./use-beneficiary-stream-stop";
import { formatTimestampLabel } from "./helpers";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";

export function BeneficiaryStreamStopView() {
  const i18n = useTranslations("ComponentsUserWorkspaceBeneficiaryStreamStopView");
  const { rows, select, refreshTime, settle } = useBeneficiaryStreamStop();
  if (rows.length === 0) return null;
  return <section className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4" aria-label={i18n("title")}>
    <h3 className="font-medium">{i18n("title")}</h3>
    <p className="text-xs text-muted-foreground">{i18n("description")}</p>
    {rows.map(({ stream, details, error, selected, status }) => {
      return <div key={stream.id} className="space-y-2 rounded-md border border-border/60 p-3">
        <p className="font-medium">{i18n("payment", { id: stream.id })}</p>
        {status ? <p className="text-xs">{i18n(status)}</p> : null}
        <p className="break-all text-xs text-muted-foreground">{stream.payoutAddress}</p>
        <p className="text-xs">{i18n("currentEnd", { date: formatTimestampLabel(BigInt(stream.endDate)) })}</p>
        {details ? <>
          <p className="text-xs">{i18n("estimatedCutoff", { date: formatTimestampLabel(details.cutoff) })}</p>
          <p className="text-xs">{i18n("debt", {
            amount: details.unit === "lovelace" ? formatLovelaceAsAda(String(details.retainedDebt)) : String(details.retainedDebt),
            asset: resolveAssetIdentity(details.unit).symbol
          })}</p>
        </> : <p className="text-xs text-muted-foreground" role="status">{error}</p>}
        <Button type="button" variant={selected ? "default" : "secondary"} disabled={Boolean(error)}
          aria-pressed={selected} onClick={() => select(stream.id)}>
          {selected ? i18n("selected") : i18n("select")}
        </Button>
      </div>;
    })}
    <Button type="button" variant="outline" onClick={refreshTime}>{i18n("refreshTime")}</Button>
    <Button type="button" variant="outline" onClick={settle}>
      {i18n("settle")}
    </Button>
  </section>;
}
