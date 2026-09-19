// Integration-style proof of the client capture seam, run entirely in-process:
// a real `Sentry.init` with a recording transport (no network), the DSN gate,
// and the full event pipeline (beforeSend scrubbing included).
//
// The SDK surface is reached through `createRequire` on purpose: the dynamic
// `import("@sentry/nextjs")` inside the module under test resolves the same
// singleton client that `Sentry.init` here configures.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { before } from "node:test";

import { captureClientError } from "./sentry-client-forward";
import { buildSentryInitOptions } from "./sentry-options";

const Sentry = createRequire(import.meta.url)("@sentry/nextjs") as {
  init: (options: Record<string, unknown>) => void;
  dedupeIntegration: () => unknown;
  flush: (timeout: number) => Promise<boolean>;
};

const DUMMY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";
const TEST_ADDRESS =
  "addr_test1qzxfk92u4v3pjsh9j0mccsq8s3q7lxud9v04r7v4vpxnmfnnm8pc99f5z3wsmnzcx";

type Envelope = [
  Record<string, unknown>,
  Array<[Record<string, unknown>, Record<string, unknown>]>
];

const envelopes: Envelope[] = [];

const productionOptions = buildSentryInitOptions({
  dsn: DUMMY_DSN,
  nodeEnv: "test"
});
assert.ok(productionOptions, "the dummy DSN must enable capture");

Sentry.init({
  ...productionOptions,
  integrations: [Sentry.dedupeIntegration()],
  sendClientReports: false,
  transport: () => ({
    send: (request: unknown) => {
      envelopes.push(request as Envelope);
      return Promise.resolve({ statusCode: 200 });
    },
    flush: () => Promise.resolve(true)
  })
});

before(async () => {
  await Sentry.flush(500).catch(() => undefined);
});

function eventsWithText(text: string): Envelope[] {
  return envelopes.filter((envelope) =>
    JSON.stringify(envelope).includes(text)
  );
}

test("without a DSN the gate closes before the SDK is even fetched", async () => {
  const previous = process.env.NEXT_PUBLIC_SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  try {
    envelopes.length = 0;
    captureClientError("ui.tx_build_failed", new Error("gate stays shut"));
    await Sentry.flush(1000);
    assert.equal(envelopes.length, 0, "no envelope may be sent without a DSN");
  } finally {
    if (previous !== undefined) {
      process.env.NEXT_PUBLIC_SENTRY_DSN = previous;
    }
  }
});

test("an unexpected failure reaches the transport with its context, scrubbed", async () => {
  const previous = process.env.NEXT_PUBLIC_SENTRY_DSN;
  process.env.NEXT_PUBLIC_SENTRY_DSN = DUMMY_DSN;
  try {
    envelopes.length = 0;
    const error = new TypeError(`build exploded for ${TEST_ADDRESS}`);
    captureClientError("ui.tx_build_failed", error, {
      action: "mint",
      diagnosticId: "abc-123"
    });

    await Sentry.flush(2000);

    const forwarded = eventsWithText("ui.tx_build_failed");
    assert.equal(forwarded.length, 1, "exactly one envelope must be sent");
    const eventItem = forwarded[0]![1]?.find(([header]) => header.type === "event");
    assert.ok(eventItem, "the envelope must carry an event item");
    const payload = eventItem[1] as {
      exception?: { values?: Array<{ type?: string; value?: string }> };
      extra?: Record<string, unknown>;
    };
    // The live error passes through unserialized, so grouping sees the real class.
    assert.equal(payload.exception?.values?.[0]?.type, "TypeError");
    assert.ok(
      !JSON.stringify(payload).includes("addr_test1"),
      "the wallet address must be redacted before transport"
    );
    assert.equal(payload.extra?.logEvent, "ui.tx_build_failed");
    assert.equal(payload.extra?.diagnosticId, "abc-123");
  } finally {
    if (previous !== undefined) {
      process.env.NEXT_PUBLIC_SENTRY_DSN = previous;
    } else {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    }
  }
});
