import assert from "node:assert/strict";
import test from "node:test";
import { InvalidJsonError, readBoundedJson, RequestBodyTooLargeError } from "./request-body";

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
