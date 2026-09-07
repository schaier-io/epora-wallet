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
        {/*
          The row padding sits on the `<summary>`, not on the `<details>`. `<summary>` is the
          element that takes the click, so padding on its parent buys no target at all: with
          `py-2` on the `<details>` the summary measured 20px tall inside a 36px row, and the
          12px above and below it did nothing. On the summary, 12px around a 20px line is a 44px
          target. The `first:pt-0 last:pb-0` trim went with it, because it took the first and
          last rows below even the 36px they had.
        */}
        {PRODUCT_FAQ.map((entry) => (
          <details key={entry.question} className="group">
            {/*
              `list-none` and nothing else. This also carried `marker:hidden`, which changed
              nothing: `display: flex` on a `<summary>` drops `list-item` so there is no
              marker box left to hide, and `list-none` had already zeroed the list style.
              Measured A/B -- with and without the class, listStyleType `none`, display
              `flex`, ::marker display `block` -- against a bare summary's `disclosure-closed`
              / `list-item` / `inline`. `display` is not a property `::marker` accepts either,
              so it could not have been doing the work on any engine.
            */}
            {/*
              A ring, not the `focus-visible:underline` the inline text links carry. This row is
              a 44px-tall disclosure control, and an underline drawn under the question text
              alone left the rest of the row, the chevron that states open/closed included, with
              no indicator on it. The ring is the one `ui/accordion`'s trigger draws, because
              that is the same disclosure pattern.

              `ring-ring` at full strength, never halved. Measured on the running page: `--ring`
              is oklch(0.556 0 0) in the dark theme and the card under it is oklch(0.205 0 0),
              which is 3.79:1. At 50% alpha the ring composites to sRGB 69/255 and the pair
              falls to 1.87:1, under the 3:1 WCAG 1.4.11 floor a focus indicator has to clear.
            */}
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-3 text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring">
              {entry.question}
              <ChevronDown
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="mb-3 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
              {entry.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
