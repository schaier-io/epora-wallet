"use client";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageHeadingClass } from "@/components/ui/page-heading";

type PayeeCardHeaderProps = {
  /** Turns the refresh control's spinner on and disables it while a scan runs. */
  refreshing?: boolean;
  /** When absent the refresh control does not render: the view is not mounted yet. */
  onRefresh?: () => void;
};

/**
 * The /payee card's static header. Shared between `PayeeView` and the page's two loading
 * fallbacks so the heading and the note paragraph paint with the server HTML instead of
 * waiting for the view's async chunk (issue #502: that paragraph was the route's LCP
 * element, painted only once the Mesh chunk arrived). The refresh control appears only
 * once the live view owns a scan to refresh.
 */
export function PayeeCardHeader({ refreshing = false, onRefresh }: PayeeCardHeaderProps) {
  const i18n = useTranslations("ComponentsPayeePayeeView");
  return (
    <CardHeader>
      <div className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div>
          {/* The page's own heading. `/payee` holds one card and this names it, so the
              page no longer carries a hidden `h1` saying the same words at a different
              level. `pageHeadingClass` overrides the CardTitle rung: `cn` merges with
              tailwind-merge, so the page scale wins over `text-lg font-medium`. */}
          <CardTitle as="h1" className={pageHeadingClass}>
            {i18n("scheduledPaymentsToYou")}
          </CardTitle>
          <CardDescription>
            {i18n("paymentsOtherWalletsSendToYouALittle")}
          </CardDescription>
        </div>
        {onRefresh ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {i18n("refresh")}
          </Button>
        ) : null}
      </div>
    </CardHeader>
  );
}
