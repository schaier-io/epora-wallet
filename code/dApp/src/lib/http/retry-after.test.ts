import assert from "node:assert/strict";
import test from "node:test";
import { parseRetryAfterMs } from "./retry-after";

test("preserves upstream retry delays and rejects invalid delays", () => {
  assert.equal(parseRetryAfterMs("60"), 60_000);
  assert.equal(parseRetryAfterMs("0"), 0);
  for (const value of [null, "", " ", "-1", "invalid"]) assert.equal(parseRetryAfterMs(value), undefined);
});
test("converts HTTP dates into remaining delay", () => {
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse("2026-09-08T12:00:00Z");
    assert.equal(parseRetryAfterMs("Tue, 08 Sep 2026 12:01:00 GMT"), 60_000);
    assert.equal(parseRetryAfterMs("Tue, 08 Sep 2026 11:59:00 GMT"), 0);
  } finally { Date.now = originalNow; }
});
