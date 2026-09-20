import assert from "node:assert/strict";
import test from "node:test";
import { isNavLinkActive } from "@/components/layout/top-nav";

test("wallet navigation is current only on the wallet root", () => {
  assert.equal(isNavLinkActive("/user", "/user"), true);
  assert.equal(isNavLinkActive("/user/proposals", "/user"), false);
});

test("nested navigation destinations stay current below their route", () => {
  assert.equal(isNavLinkActive("/user/proposals", "/user/proposals"), true);
  assert.equal(isNavLinkActive("/user/proposals/example", "/user/proposals"), true);
  assert.equal(isNavLinkActive("/payee", "/payee"), true);
  assert.equal(isNavLinkActive("/missing", "/payee"), false);
});

// `app/page.tsx` re-exports `app/user/page.tsx`, so `/` renders the smart wallet page. The
// nav used to light nothing up there while the workspace marked itself current.
test("wallet navigation is current on the site root as well", () => {
  assert.equal(isNavLinkActive("/", "/user"), true);
  assert.equal(isNavLinkActive("/", "/user/proposals"), false);
  assert.equal(isNavLinkActive("/", "/payee"), false);
});
