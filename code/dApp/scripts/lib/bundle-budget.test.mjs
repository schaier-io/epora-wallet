import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRouteBundleStats,
  parseRouteStat
} from "./bundle-budget.mjs";

const UNDER_BUDGET = [
  { route: "/", firstLoadUncompressedJsBytes: 876 * 1024 },
  { route: "/user", firstLoadUncompressedJsBytes: 876 * 1024 }
];

test("parseRouteStat normalises a well-formed entry", () => {
  assert.deepEqual(parseRouteStat({ route: "/user", firstLoadUncompressedJsBytes: 1234 }), {
    route: "/user",
    bytes: 1234
  });
});

test("parseRouteStat rejects entries without a route or a byte count", () => {
  assert.throws(() => parseRouteStat({ firstLoadUncompressedJsBytes: 1 }), /no usable "route"/);
  assert.throws(() => parseRouteStat({ route: "/user" }), /no usable "firstLoadUncompressedJsBytes"/);
  assert.throws(
    () => parseRouteStat({ route: "/user", firstLoadUncompressedJsBytes: 1.5 }),
    /no usable "firstLoadUncompressedJsBytes"/
  );
});

test("routes at or under budget produce no violations", () => {
  assert.deepEqual(evaluateRouteBundleStats(UNDER_BUDGET, { "/": 1100, "/user": 1100 }), []);
});

test("a route exactly at its budget passes (budget is a ceiling)", () => {
  const stats = [{ route: "/", firstLoadUncompressedJsBytes: 1100 * 1024 }];
  assert.deepEqual(evaluateRouteBundleStats(stats, { "/": 1100 }), []);
});

test("one KB over the budget fails, naming route and both numbers", () => {
  const stats = [{ route: "/user", firstLoadUncompressedJsBytes: 1101 * 1024 }];
  assert.deepEqual(
    evaluateRouteBundleStats(stats, { "/user": 1100 }),
    ["/user: first-load JS 1101 KB exceeds the 1100 KB budget"]
  );
});

test("a served route without a budget fails so new weight cannot ship silently", () => {
  const stats = [{ route: "/somewhere-new", firstLoadUncompressedJsBytes: 100 * 1024 }];
  assert.deepEqual(
    evaluateRouteBundleStats(stats, {}),
    ["/somewhere-new: served route has no first-load JS budget; add one to FIRST_LOAD_JS_BUDGETS_KB"]
  );
});

test("a budgeted route missing from the build stats fails", () => {
  assert.deepEqual(
    evaluateRouteBundleStats([], { "/user": 1100 }),
    ["/user: no build stats found, but a budget (1100 KB) is configured"]
  );
});

test("duplicate route entries fail instead of silently picking one", () => {
  assert.throws(
    () =>
      evaluateRouteBundleStats(
        [
          { route: "/user", firstLoadUncompressedJsBytes: 1 },
          { route: "/user", firstLoadUncompressedJsBytes: 2 }
        ],
        { "/user": 1100 }
      ),
    /twice/
  );
});

test("non-array stats fail loudly", () => {
  assert.throws(() => evaluateRouteBundleStats({}, {}), /must be an array/);
});
