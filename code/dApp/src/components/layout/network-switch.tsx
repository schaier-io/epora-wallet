"use client";

import { useTranslations } from "next-intl";
import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { NETWORK_DEPLOYMENTS, SWITCHABLE_NETWORKS, networkSwitchUrl } from "@/lib/network-deployments";

const CHOICE_CLASS = "inline-flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm";

export function NetworkSwitch() {
  const t = useTranslations("NetworkSwitch");
  return (
    <nav aria-label={t("label")} className="flex flex-wrap items-center gap-2">
      {CARDANO_NETWORK === "preview" ? <span className="text-sm text-muted-foreground">{t("preview")}</span> : null}
      {SWITCHABLE_NETWORKS.map((network) => {
        const label = <>{t(network)}{" "}<span className="text-xs text-muted-foreground">{t(network === "mainnet" ? "realFunds" : "testFunds")}</span></>;
        if (network === CARDANO_NETWORK) {
          return <span key={network} aria-current="true" className={`${CHOICE_CLASS} border-primary/50 bg-primary/10 font-semibold`}>{label}</span>;
        }
        const href = networkSwitchUrl(network, NETWORK_DEPLOYMENTS);
        return href
          ? <a key={network} href={href} rel="noreferrer" className={`${CHOICE_CLASS} border-border hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>{label}</a>
          : <span key={network} aria-disabled="true" className={`${CHOICE_CLASS} border-border text-muted-foreground`}>{label}<span className="text-xs">{t("unavailable")}</span></span>;
      })}
    </nav>
  );
}
