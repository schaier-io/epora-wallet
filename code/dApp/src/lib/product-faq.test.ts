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

test("no answer is left empty", () => {
  for (const entry of PRODUCT_FAQ) {
    assert.ok(entry.question.trim().length > 0);
    assert.ok(entry.answer.trim().length > 20, `answer for "${entry.question}" is a stub`);
  }
});
