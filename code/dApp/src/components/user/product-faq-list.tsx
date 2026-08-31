import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { PRODUCT_FAQ } from "@/lib/product-faq";

/**
 * The pre-connect FAQ, visible.
 *
 * The answers already existed, but only inside the page's `FAQPage` JSON-LD, so a search
 * crawler could read what the product is and whether it takes custody, and the person about
 * to connect a wallet could not. Native `<details>` so it works before hydration and with a
 * keyboard by default.
 */
export function ProductFaqList() {
  const i18n = useTranslations("ComponentsUserProductFaqList");
  return (
    <section aria-labelledby="product-faq-heading" className="space-y-2">
      <h2
        id="product-faq-heading"
        className="eyebrow font-medium text-muted-foreground"
      >
        {i18n("beforeYouConnect")}
      </h2>
      {/*
        No box of its own. A `rounded-lg border` panel with `px-3` inside it held every question
        13px in from the rail the rest of the card sits on: measured at 1440x900, the questions
        ran 374..1066 against a numbered list, an intro paragraph and this section's own heading
        that all run 361..1079. A divided list, the same shape as the numbered list above it,
        puts the questions back on that rail.
      */}
      <div className="divide-y divide-border/40">
        {PRODUCT_FAQ.map((entry) => (
          <details key={entry.question} className="group py-2 first:pt-0 last:pb-0">
            {/*
              `list-none` and nothing else. This also carried `marker:hidden`, which changed
              nothing: `display: flex` on a `<summary>` drops `list-item` so there is no
              marker box left to hide, and `list-none` had already zeroed the list style.
              Measured A/B -- with and without the class, listStyleType `none`, display
              `flex`, ::marker display `block` -- against a bare summary's `disclosure-closed`
              / `list-item` / `inline`. `display` is not a property `::marker` accepts either,
              so it could not have been doing the work on any engine.
            */}
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:underline">
              {entry.question}
              <ChevronDown
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
              {entry.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
