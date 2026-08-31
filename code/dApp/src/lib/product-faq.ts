/**
 * The six questions a stranger asks before connecting a wallet.
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
    question: "What is Epora Wallet?",
    answer:
      "Epora Wallet is a non-custodial, permission-based wallet on Cardano. It keeps funds in an on-chain smart contract and lets one wallet be shared across people with different roles: owners control the rules, spenders can spend up to a daily limit, and recovery contacts can recover access if owners lose their keys. You authorize every action by signing with your own Cardano wallet."
  },
  {
    question: "Does Epora Wallet hold my keys or funds?",
    answer:
      "No. Epora is non-custodial. Your ADA stays in a Cardano smart contract governed by rules you set, and every action is authorized by your own connected wallet. Epora never takes custody of your keys or funds."
  },
  {
    question: "How is Epora Wallet different from a regular Cardano wallet?",
    answer:
      "A regular Cardano wallet has one key and one owner. Lose the key and the ADA is gone for good. Epora keeps funds in an on-chain smart contract with rules on top: per-spender daily limits, multi-signature approvals, scheduled payments, and a proof of life that lets recovery contacts recover access after a period of inactivity."
  },
  {
    question: "What does it cost?",
    answer:
      "Epora itself is free. There is no fee, no subscription and no token to buy. You pay only the ordinary Cardano network fee for each transaction you sign, which goes to the network and not to us. On Preprod those fees are paid in test ADA, so they cost nothing real."
  },
  {
    question: "Is Epora Wallet on Cardano mainnet?",
    answer:
      "Not yet. Epora Wallet currently runs on the Cardano Preprod test network while the project is in active development under its Project Catalyst grant. Funds and signatures on Preprod have no monetary value, so you can try every feature risk-free."
  },
  {
    question: "What is a dead-man switch wallet?",
    answer:
      "A dead-man switch wallet starts a recovery process automatically when the main owners stop using it for a set period. In Epora Wallet, owners configure a proof of life; if no owner signs a Cardano transaction before it expires, recovery contacts can step in and recover the wallet. It is useful for inheritance, or for a team that cannot risk losing access to its treasury."
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
