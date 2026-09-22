"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARDANO_NETWORK, cardanoFaucetUrl } from "@/lib/cardano-network";
import { LEGAL_OPERATOR, MIT_LICENSE_URL } from "@/lib/legal";
import { BETA_ACKNOWLEDGEMENTS } from "@/lib/legal/beta-consent";
import { NetworkSwitch } from "./network-switch";
import type { useBetaConsent } from "./use-beta-consent";

type ConsentModel = ReturnType<typeof useBetaConsent>;

export function RiskDisclaimerGate({ model }: { model: ConsentModel }) {
  const i18n = useTranslations("BetaConsent");
  const faucet = cardanoFaucetUrl();
  return (
    <main className="container flex min-h-dvh items-center justify-center py-8" id="main">
      <section aria-labelledby="risk-disclaimer-title" className="w-full max-w-xl space-y-6 rounded-2xl border border-amber-500/30 bg-background p-4 shadow-2xl sm:p-8">
        <AlertTriangle className="h-7 w-7 text-amber-400" aria-hidden="true" />
        <h1 id="risk-disclaimer-title" className="text-xl font-semibold">{i18n("title")}</h1>
        <p className="font-semibold text-amber-200">{CARDANO_NETWORK === "mainnet" ? i18n("mainnet") : i18n("testnet", { network: CARDANO_NETWORK })}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{i18n("disclosure")}</p>
        <p className="text-sm text-muted-foreground">{i18n("operator", { company: LEGAL_OPERATOR.name })}</p>
        <nav aria-label={i18n("termsLink")} className="flex flex-wrap gap-4 text-sm underline underline-offset-4">
          <a href="/terms">{i18n("termsLink")}</a>
          <a href="/privacy">{i18n("privacyLink")}</a>
          <a href="/legal">{i18n("legalLink")}</a>
          <a href={MIT_LICENSE_URL}>{i18n("licenseLink")}</a>
          {faucet ? <a href={faucet} target="_blank" rel="noopener noreferrer">{i18n("faucet")}</a> : null}
        </nav>
        <NetworkSwitch />
        <form onSubmit={(event) => { event.preventDefault(); void model.accept(); }} className="space-y-4">
          {BETA_ACKNOWLEDGEMENTS.map((key) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
              <input type="checkbox" checked={model.acknowledgements[key]} disabled={model.pending}
                onChange={(event) => model.setAcknowledgements((current) => ({ ...current, [key]: event.target.checked }))}
                className="mt-1 h-5 w-5 shrink-0 accent-amber-400" />
              <span>{i18n(key)}</span>
            </label>
          ))}
          <p className="text-xs leading-relaxed text-muted-foreground">{i18n("privacyNotice")}</p>
          {model.failed ? <p role="alert" className="text-sm text-red-300">{i18n("error")}</p> : null}
          <Button type="submit" disabled={!model.ready || model.pending} className="w-full">
            {i18n(model.pending ? "pending" : "continue")}
          </Button>
        </form>
      </section>
    </main>
  );
}
