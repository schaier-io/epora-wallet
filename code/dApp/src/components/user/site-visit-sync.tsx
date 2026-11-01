"use client";

import { useTranslations } from "next-intl";
import { useSiteVisitSync } from "./use-site-visit-sync";

export function SiteVisitSync() {
  const i18n = useTranslations("ComponentsUserSiteVisitSync");
  const state = useSiteVisitSync();
  if (state === "idle") return null;
  return <p role="status" className="px-1 py-2 text-sm text-muted-foreground">{i18n(state)}</p>;
}
