import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidJsonError,
  readBoundedJson,
  RequestBodyTooDeepError,
  RequestBodyTooLargeError
} from "./request-body";

test("readBoundedJson parses a body at the byte boundary", async () => {
  const body = JSON.stringify({ value: "€" });
  const request = new Request("http://localhost", { method: "POST", body });
  assert.deepEqual(await readBoundedJson(request, Buffer.byteLength(body)), { value: "€" });
});

test("readBoundedJson rejects a streamed body beyond the byte boundary", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ value: "too large" })
  });
  await assert.rejects(readBoundedJson(request, 4), RequestBodyTooLargeError);
});

test("readBoundedJson rejects an oversized content-length before reading", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    headers: { "content-length": "9000" },
    body: "{}"
  });
  await assert.rejects(readBoundedJson(request, 100), RequestBodyTooLargeError);
});

test("readBoundedJson types a malformed body so a route can answer 400", async () => {
  const request = new Request("http://localhost", { method: "POST", body: "{ not json" });
  await assert.rejects(readBoundedJson(request), InvalidJsonError);
});

test("readBoundedJson types a missing body the same way", async () => {
  const request = new Request("http://localhost", { method: "POST" });
  await assert.rejects(readBoundedJson(request), InvalidJsonError);
});

test("readBoundedJson accepts nesting a real datum reaches", async () => {
  // A state datum encodes 6 levels deep. 40 is well past anything real and
  // still inside the ceiling.
  const body = "[".repeat(40) + "]".repeat(40);
  const request = new Request("http://localhost", { method: "POST", body });
  assert.ok(Array.isArray(await readBoundedJson(request)));
});

test("readBoundedJson rejects a body nested past the ceiling", async () => {
  // Deep enough to overflow zod's recursive PlutusData schema, and small
  // enough to fit inside the 32 KB build-route body limit.
  const depth = 15_000;
  const request = new Request("http://localhost", {
    method: "POST",
    body: "[".repeat(depth) + "]".repeat(depth)
  });
  await assert.rejects(readBoundedJson(request), RequestBodyTooDeepError);
});
