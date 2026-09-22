"use client";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageHeadingClass } from "@/components/ui/page-heading";

type PayeeCardHeaderProps = {
  /** Spinner and `aria-busy`. Background refetch only, not the first-load wait. */
  refreshing?: boolean;
  /** When set, overrides `refreshing` for the disabled state. First load and a
   * disconnected page both disable Refresh without spinning. */
  disabled?: boolean;
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
export function PayeeCardHeader({
  refreshing = false,
  disabled,
  onRefresh
}: PayeeCardHeaderProps) {
  const i18n = useTranslations("ComponentsPayeePayeeView");
  const refreshDisabled = disabled ?? refreshing;
  return (
    <CardHeader>
      <div className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-2">
        {/* `flex-1`, not `min-w-0` on its own: `min-width: 0` leaves the flex base size at
            this div's max-content width, so it overflowed the line and pushed Refresh onto a
            second flex row where `justify-between` never applied. `flex-1` puts the basis at
            0. `space-y-1` sits here and not on `CardHeader`, which has this div as its only
            child and so matches nothing with `:not(:last-child)`.

            `basis-64` because a basis of 0 shrinks instead of wrapping, so the row's own
            `flex-wrap` could never fire: at a 320px viewport this column was 140px of a
            254px row and the 24px heading broke over three lines beside a 102px Refresh
            button. 256px is a bounded basis, so the max-content overflow the comment above
            describes does not come back, and `flex-1` still grows the column on a wide
            card. Below 268px of row the button now takes its own line. */}
        <div className="min-w-0 flex-1 basis-64 space-y-1">
          {/* "Scheduled income", the name the top navigation uses for this destination.
              The page said "Scheduled payments to you", which also reads a step too close
              to the wallet's own outgoing "Scheduled payments".

              The page's own heading. `/payee` holds one card and this names it, so the
              page no longer carries a hidden `h1` saying the same words at a different
              level. `pageHeadingClass` overrides the CardTitle rung: `cn` merges with
              tailwind-merge, so the page scale wins over `text-lg font-medium`. */}
          <CardTitle as="h1" className={pageHeadingClass}>
            {i18n("scheduledPaymentsToYou")}
          </CardTitle>
          {/* Two sentences, not four. The description used to end "Shortening a payment
              stops it building up further, and never reduces what is already owed. The
              paying wallet's owners can change a payment later." -- two rules that only
              apply once a payment exists, and which the shorten review states again where
              they apply ("This stops future earnings at the time below. The unpaid amount
              stays owed to you. The paying wallet's owners can change the schedule
              later."). On the empty page they were rules about nothing. */}
          <CardDescription className="max-w-prose">
            {i18n("paymentsOtherWalletsSendToYouALittle")}
          </CardDescription>
        </div>
        {onRefresh ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshDisabled}
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
