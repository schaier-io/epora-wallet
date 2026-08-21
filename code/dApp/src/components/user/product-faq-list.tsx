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
  return (
    <section aria-labelledby="product-faq-heading" className="space-y-2">
      <h2
        id="product-faq-heading"
        className="eyebrow font-medium text-muted-foreground"
      >
        Before you connect
      </h2>
      <div className="divide-y divide-border/40 rounded-lg border border-border/60 bg-background/35">
        {PRODUCT_FAQ.map((entry) => (
          <details key={entry.question} className="group px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground marker:hidden focus-visible:outline-none focus-visible:underline">
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
