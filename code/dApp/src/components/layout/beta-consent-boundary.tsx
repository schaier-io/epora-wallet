"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { isLegalPath } from "@/lib/legal";
import { RiskDisclaimerGate } from "./risk-disclaimer-gate";
import { BetaNotice } from "./beta-notice";
import { useBetaConsent } from "./use-beta-consent";

export function BetaConsentBoundary({ children, legalContent, initialAccepted }: {
  children: ReactNode;
  legalContent: ReactNode;
  initialAccepted: boolean;
}) {
  const pathname = usePathname();
  const i18n = useTranslations("BetaConsent");
  const model = useBetaConsent(initialAccepted);
  if (isLegalPath(pathname)) {
    return <><BetaNotice /><div className="container py-8"><a href="/user" className="text-sm underline underline-offset-4">{i18n("back")}</a>{legalContent}</div></>;
  }
  return model.accepted ? children : <RiskDisclaimerGate model={model} />;
}
