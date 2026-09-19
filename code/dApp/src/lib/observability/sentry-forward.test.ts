// Integration-style proof of the capture pipeline, run entirely in-process:
// a real `Sentry.init` with a recording transport (no network), the logger
// seam, and the full event pipeline (beforeSend scrubbing included).
//
// The SDK surface is reached through `createRequire` on purpose:
// `@sentry/nextjs` copies most of `@sentry/node`'s exports onto itself at
// require time, and ESM namespace snapshots (what `import * as` sees under
// tsx) can miss those runtime-added keys. `require` sees the final module.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { before } from "node:test";

import { captureServerLogError } from "./sentry-forward";
import { buildSentryInitOptions } from "./sentry-options";

const Sentry = createRequire(import.meta.url)("@sentry/nextjs") as {
  init: (options: Record<string, unknown>) => void;
  dedupeIntegration: () => unknown;
  flush: (timeout: number) => Promise<boolean>;
};

const DUMMY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";
const TEST_ADDRESS =
  "addr_test1qzxfk92u4v3pjsh9j0mccsq8s3q7lxud9v04r7v4vpxnmfnnm8pc99f5z3wsmnzcx";

// v10 transports receive the `Envelope` object: a [header, items] tuple where
// each item is a [itemHeader, payload] pair. The error payload rides in the
// first "event" item.
type Envelope = [
  Record<string, unknown>,
  Array<[Record<string, unknown>, Record<string, unknown>]>
];

const envelopes: Envelope[] = [];

// Initialize with the SAME options the instrumentation entry uses, so the
// test exercises the production wiring: gate, release, scrubbing hooks, and
// integrations. Only the transport and client reports are test-specific.
const productionOptions = buildSentryInitOptions({
  dsn: DUMMY_DSN,
  nodeEnv: "test"
});
assert.ok(productionOptions, "the dummy DSN must enable capture");

Sentry.init({
  ...productionOptions,
  integrations: [Sentry.dedupeIntegration()],
  // Dropped events normally surface as "client report" items; these tests
  // count event payloads, so reports stay off.
  sendClientReports: false,
  transport: () => ({
    send: (request: unknown) => {
      envelopes.push(request as Envelope);
      return Promise.resolve({ statusCode: 200 });
    },
    flush: () => Promise.resolve(true)
  })
});

// Drain whatever the SDK emits around initialization, so the per-test counts
// below measure only what each capture sends. On a slow CI runner an init-time
// or background envelope would otherwise land inside a test's flush window
// and break an exact-count assertion.
before(async () => {
  await Sentry.flush(500).catch(() => undefined);
});

function payloadOf(envelope: Envelope): Record<string, unknown> {
  const eventItem = envelope[1]?.find(
    ([itemHeader]) => itemHeader.type === "event"
  );
  assert.ok(eventItem, `envelope without an event item: ${JSON.stringify(envelope[0])}`);
  return eventItem[1];
}

test("logger.error forwards an Error through the seam to the transport, scrubbed", async () => {
  // Match on the forwarded error itself rather than counting every envelope
  // in the flush window: on a slow CI runner an unrelated background event
  // must not fail an exact-count assertion.
  envelopes.length = 0;
  const error = new Error(`submit failed for receiver ${TEST_ADDRESS}`);
  captureServerLogError("api.tx_lock-funds_build_failed", {
    err: { name: "BuildError", message: error.message, stack: error.stack }
  });

  await Sentry.flush(2000);

  const forwarded = envelopes.filter((envelope) => {
    const item = envelope[1]?.find(([itemHeader]) => itemHeader.type === "event");
    const payload = item?.[1] as {
      exception?: { values?: Array<{ type?: string }> };
    } | undefined;
    return payload?.exception?.values?.[0]?.type === "BuildError";
  });
  assert.equal(forwarded.length, 1, "exactly one envelope must be sent");
  const payload = payloadOf(forwarded[0]!);
  const exception = payload.exception as {
    values: Array<{ type?: string; value?: string }>;
  };
  // The bridge preserves the recorded error name, so Sentry groups by the
  // real class instead of collapsing every forwarded failure under `Error`.
  assert.equal(exception.values[0]?.type, "BuildError");
  assert.ok(
    !String(exception.values[0]?.value).includes("addr_test1"),
    "the wallet address must be redacted before transport"
  );
  assert.match(String(exception.values[0]?.value), /\[REDACTED\]/);
});

test("a routine wallet rejection is dropped before the transport sees it", async () => {
  envelopes.length = 0;
  captureServerLogError("api.wallet_declined", {
    err: { message: "user declined to sign tx" }
  });

  await Sentry.flush(2000);

  assert.equal(envelopes.length, 0, "no envelope may be sent for a rejection");
});

test("a log call without an err field captures a message event with its context", async () => {
  envelopes.length = 0;
  captureServerLogError("api.stt_sync_stale", { route: "/api/stt/sync", attempts: 3 });

  await Sentry.flush(2000);

  assert.equal(envelopes.length, 1);
  const payload = payloadOf(envelopes[envelopes.length - 1]);
  assert.ok(payload.message, "expected a message-carrying event payload");
  assert.ok(JSON.stringify(payload).includes("attempts"));
});
