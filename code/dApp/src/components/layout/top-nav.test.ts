import assert from "node:assert/strict";
import test from "node:test";
import { isCurrentNavItem } from "@/components/layout/top-nav";

test("wallet navigation is current only on the wallet root", () => {
  assert.equal(isCurrentNavItem("/user", "/user"), true);
  assert.equal(isCurrentNavItem("/user/proposals", "/user"), false);
});

test("nested navigation destinations stay current below their route", () => {
  assert.equal(isCurrentNavItem("/user/proposals", "/user/proposals"), true);
  assert.equal(isCurrentNavItem("/user/proposals/example", "/user/proposals"), true);
  assert.equal(isCurrentNavItem("/payee", "/payee"), true);
  assert.equal(isCurrentNavItem("/missing", "/payee"), false);
});
