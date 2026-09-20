"use client";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { PayeeCardHeader } from "@/components/payee/payee-card-header";
import { SkeletonCard } from "@/components/ui/skeleton";

/**
 * The /payee card's loading state: the real card shell (container, card, header) around
 * a status line and a skeleton. Shared by the page's server-rendered Suspense fallback
 * and the dynamic import's client loading fallback (lazy-payee-view), so the heading and
 * the note paragraph paint once, with the server HTML, and never flash away on the way
 * to the live view. Before issue #502 the header only existed inside the view's async
 * chunk and the paragraph was the route's LCP element at 14.5 s simulated.
 *
 * The header carries no refresh control; the live view adds it once a scan exists to
 * refresh. The SkeletonCard below is `aria-hidden`, so the status line is the only
 * thing a screen reader has to tell it the page is still loading.
 */
export function PayeeCardFallback() {
  const i18n = useTranslations("AppPayeePage");
  return (
    <div className="container flex flex-col py-3 md:py-4">
      <Card className="flex w-full flex-col" aria-busy="true">
        <PayeeCardHeader />
        <CardContent className="flex flex-col space-y-4">
          <div
            role="status"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {i18n("preparingYourPayments")}
          </div>
          <SkeletonCard />
        </CardContent>
      </Card>
    </div>
  );
}
