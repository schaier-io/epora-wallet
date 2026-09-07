import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibProductFaq.json";

const i18n = createDefaultTranslator("LibProductFaq", defaultMessages);

/**
 * The seven questions a stranger asks before connecting a wallet.
 *
 * These answers used to exist only inside the `FAQPage` JSON-LD in `app/layout.tsx`, so they
 * were shipped to search crawlers and to nobody else. The person deciding whether to connect
 * a wallet to an unaudited beta could not read them. One source now feeds both the structured
 * data and the visible list on the pre-connect screen, so the two can never drift.
 */
export type FaqEntry = {
  question: string;
  answer: string;
};

export const PRODUCT_FAQ: readonly FaqEntry[] = [
  {
    question: i18n("whatIsEporaWalletQuestion"),
    answer: i18n("whatIsEporaWalletAnswer")
  },
  {
    question: i18n("custodyQuestion"),
    answer: i18n("custodyAnswer")
  },
  {
    question: i18n("differenceQuestion"),
    answer: i18n("differenceAnswer")
  },
  {
    question: i18n("fundPoolsQuestion"),
    answer: i18n("fundPoolsAnswer")
  },
  {
    question: i18n("costQuestion"),
    answer: i18n("costAnswer")
  },
  {
    question: i18n("mainnetQuestion"),
    answer: i18n("mainnetAnswer")
  },
  {
    question: i18n("deadManSwitchQuestion"),
    answer: i18n("deadManSwitchAnswer")
  }
] as const;

/** The `mainEntity` of a schema.org `FAQPage`, built from the same entries the page renders. */
export function buildFaqJsonLdEntities(entries: readonly FaqEntry[] = PRODUCT_FAQ) {
  return entries.map((entry) => ({
    "@type": "Question",
    name: entry.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: entry.answer
    }
  }));
}
