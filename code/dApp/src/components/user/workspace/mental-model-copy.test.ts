import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FUND_POOLS_HINT,
  SETUP_HELPER_HINT
} from "@/components/user/workspace/mental-model-copy";

/**
 * These two strings are the app's only definitions of its own coinage: the assets panel and
 * the spend editors both render `FUND_POOLS_HINT`, and the mint screen and the setup
 * checkpoint both render `SETUP_HELPER_HINT`. A definition that drifted would teach two
 * mental models, so the properties that make them definitions are held here: they name the
 * Cardano term the coinage stands for, and they stay inside the pre-connect FAQ's
 * plain-language bar (no standard numbers; PRODUCT.md, "explain Cardano-specific terms at
 * first use").
 */
test("the fund-pool definition names the Cardano term and the receipt wording", () => {
  assert.match(FUND_POOLS_HINT, /\bUTxOs?\b/);
  assert.match(FUND_POOLS_HINT, /fund pools?/i);
  // The spending story has to be the eUTxO story: whole pools are spent, change returns.
  assert.match(FUND_POOLS_HINT, /whole pools/);
  assert.match(FUND_POOLS_HINT, /change/);
  // Receipt copy says value was "kept locked"; the definition has to meet that word too.
  assert.match(FUND_POOLS_HINT, /locked/);
});

test("the setup-helper definition says what is deposited and what it buys", () => {
  assert.match(SETUP_HELPER_HINT, /one-time deposit/);
  assert.match(SETUP_HELPER_HINT, /once/);
  assert.match(SETUP_HELPER_HINT, /cheaper|smaller/);
});

test("neither definition cites a standard number instead of explaining", () => {
  for (const line of [FUND_POOLS_HINT, SETUP_HELPER_HINT]) {
    assert.doesNotMatch(line, /\bCIP[-\s]?\d+/i);
  }
});
