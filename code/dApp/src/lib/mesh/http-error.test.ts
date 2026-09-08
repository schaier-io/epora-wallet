import assert from "node:assert/strict";
import test from "node:test";
import { meshHttpRetryAfter, meshHttpStatus } from "./http-error";

test("HTTP metadata survives Mesh's nested JSON encoding", () => {
  const error = JSON.stringify(JSON.stringify({ status: 429, headers: { "Retry-After": "20" } }));
  assert.equal(meshHttpStatus(error), 429);
  assert.equal(meshHttpRetryAfter(error), "20");
});

test("HTTP metadata also supports typed errors and rejects invalid status values", () => {
  assert.equal(meshHttpStatus(Object.assign(new Error("invalid upstream payload"), { status: 502 })), 502);
  for (const status of [undefined, "502", 0, 200, 600, Infinity]) {
    assert.equal(meshHttpStatus({ status }), null);
  }
});

test("only a valid retry header leaves the provider boundary", () => {
  for (const value of ["", "garbage", "-1", "10\r\nOther: value", {}, Infinity]) {
    assert.equal(meshHttpRetryAfter({ headers: { "retry-after": value } }), null);
  }
  assert.equal(meshHttpRetryAfter({ headers: { "retry-after": "Wed, 21 Oct 2015 07:28:00 GMT" } }), "Wed, 21 Oct 2015 07:28:00 GMT");
});
