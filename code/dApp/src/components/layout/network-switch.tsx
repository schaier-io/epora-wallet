"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { NETWORK_DEPLOYMENTS, networkChoices } from "@/lib/network-deployments";

const CHOICE_CLASS = "flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm";

export function NetworkSwitch() {
  const t = useTranslations("NetworkSwitch");
  const choices = networkChoices(CARDANO_NETWORK, NETWORK_DEPLOYMENTS);
  if (!choices.length) return null;
  return (
    <nav aria-label={t("label")} className="inline-flex max-w-full flex-col gap-2">
      {CARDANO_NETWORK === "preview" ? <span className="text-sm text-muted-foreground">{t("preview")}</span> : null}
      <ul className="grid grid-flow-col auto-cols-fr gap-1 rounded-xl border border-border bg-foreground/5 p-1">
        {choices.map(({ network, active, href }) => {
          const label = <>
            <span className="flex flex-col gap-1">
              <span className="font-semibold">{t(network)}</span>{" "}
              <span className="text-xs text-muted-foreground">{t(network === "mainnet" ? "realFunds" : "testFunds")}</span>
            </span>
            <span className="h-4 w-4 shrink-0" aria-hidden="true">
              {active ? <Check className="h-4 w-4" /> : null}
            </span>
          </>;
          const selectedClass = network === "preprod"
            ? "border-primary/40 bg-primary/10 text-foreground shadow-sm"
            : "border-amber-400/40 bg-amber-400/10 text-amber-200 shadow-sm";
          return <li key={network}>
            {active ? <span aria-current="true" className={`${CHOICE_CLASS} ${selectedClass}`}>{label}</span>
              : <a href={href} rel="noreferrer" className={`${CHOICE_CLASS} border-transparent hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>{label}</a>}
          </li>;
        })}
      </ul>
    </nav>
  );
}
