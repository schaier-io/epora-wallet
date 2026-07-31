import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedJson, RequestBodyTooLargeError } from "./request-body";

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
