import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_FAQ, buildFaqJsonLdEntities } from "@/lib/product-faq";

/**
 * These answers shipped only inside the page's `FAQPage` JSON-LD, so a crawler could read what
 * the product is and whether it takes custody, and the person about to connect a wallet could
 * not. Both consumers now read this array; these tests hold them to it.
 */

test("the structured data carries every question the page renders, and nothing else", () => {
  const entities = buildFaqJsonLdEntities();

  assert.equal(entities.length, PRODUCT_FAQ.length);
  for (const [index, entity] of entities.entries()) {
    assert.equal(entity.name, PRODUCT_FAQ[index]!.question);
    assert.equal(entity.acceptedAnswer.text, PRODUCT_FAQ[index]!.answer);
  }
});

test("the cost question is answered before anyone connects", () => {
  // `price: "0"` went to crawlers only; a visitor was never told what this costs.
  const cost = PRODUCT_FAQ.find((entry) => /cost/i.test(entry.question));
  assert.ok(cost, "expected a question about cost");
  assert.match(cost.answer, /free/i);
  assert.match(cost.answer, /network fee/i);
});

test("the fund-pool question explains the storage model before anyone connects", () => {
  // A shared wallet shows its UTxO split where a regular wallet shows one number, and the
  // actions ("fund pools", "Tidy funds") only make sense once a reader knows that. The
  // pre-connect FAQ is the one place a stranger reads before connecting, so the contrast
  // and the spending story both live there.
  const pools = PRODUCT_FAQ.find((entry) => /fund pool/i.test(entry.question));
  assert.ok(pools, "expected a question about fund pools");
  assert.match(pools.answer, /\bUTxOs?\b/);
  assert.match(pools.answer, /fund pools?/i);
  assert.match(pools.answer, /regular wallet/i);
  assert.match(pools.answer, /change/);
  assert.match(pools.answer, /Tidy funds/);
});

test("no answer is left empty", () => {
  for (const entry of PRODUCT_FAQ) {
    assert.ok(entry.question.trim().length > 0);
    assert.ok(entry.answer.trim().length > 20, `answer for "${entry.question}" is a stub`);
  }
});

test("no answer explains the product with a standards number", () => {
  // The pre-connect FAQ is where a stranger has the least context, and the first answer
  // used to end "...signing with your own CIP-30 or CIP-45 Cardano wallet". A CIP number
  // tells that reader nothing they can act on; it is a spec citation, not an explanation.
  // Same reason "signer" left the onboarding caption beside it.
  for (const entry of PRODUCT_FAQ) {
    assert.doesNotMatch(
      entry.answer,
      /\bCIP[-\s]?\d+/i,
      `the answer to "${entry.question}" cites a CIP by number; say what it means instead`
    );
    assert.doesNotMatch(entry.question, /\bCIP[-\s]?\d+/i);
  }
});
