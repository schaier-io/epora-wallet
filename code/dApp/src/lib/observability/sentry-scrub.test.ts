import assert from "node:assert/strict";
import test from "node:test";

import {
  collectEventMessages,
  isRoutineWalletRejection,
  redactSensitiveText,
  scrubSentryEvent,
  type SentryEventLike
} from "./sentry-scrub";

const PREPROD_ADDRESS = "addr_test1qzxfk92u4v3pjsh9j0mccsq8s3q7lxud9v04r7v4vpxnmfnnm8pc99f5z3wsmnzcx";
const STAKE_ADDRESS = "stake_test1upxnmfnnm8pc99f5z3wsmnzcx";
const TX_HASH = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2";

test("redactSensitiveText replaces preprod payment and stake addresses", () => {
  const redacted = redactSensitiveText(`paid to ${PREPROD_ADDRESS} from ${STAKE_ADDRESS}`);
  assert.ok(!redacted.includes("addr_test1"), redacted);
  assert.ok(!redacted.includes("stake_test1"), redacted);
  assert.equal(redacted, "paid to [REDACTED] from [REDACTED]");
});

test("redactSensitiveText replaces mainnet-style addresses and tx hashes", () => {
  const mainnetAddress = "addr1qx2fxv2umyhttkxyxp8x0dlpdtutk6fhwgtpcd5uhqk0jujmbg7v56defh7z56xsj2pnf584n94csvh4zyvsyww4xnzpq8zran";
  const redacted = redactSensitiveText(`${mainnetAddress} spent ${TX_HASH}`);
  assert.ok(!redacted.includes("addr1"), redacted);
  assert.ok(!redacted.includes(TX_HASH), redacted);
});

test("redactSensitiveText leaves ordinary text and short hex untouched", () => {
  const text = "Cannot read properties of undefined (reading 'datum') 0xdeadbeef policyid56chars";
  assert.equal(redactSensitiveText(text), text);
});

test("isRoutineWalletRejection matches the shared decline phrasings", () => {
  const declinePhrasings = [
    "user declined to sign tx",
    "CWalletApiError: refused to sign the transaction",
    "user rejected the request",
    "signing cancelled by the wallet",
    "cancelled by user"
  ];
  for (const message of declinePhrasings) {
    assert.equal(
      isRoutineWalletRejection(exceptionEvent(message)),
      true,
      `expected rejection match: ${message}`
    );
  }
});

test("isRoutineWalletRejection keeps real failures", () => {
  const real = exceptionEvent("DataSignError: key was not found in the wallet");
  assert.equal(isRoutineWalletRejection(real), false);
  assert.equal(isRoutineWalletRejection({}), false);
});

test("isRoutineWalletRejection matches a decline buried in breadcrumbs", () => {
  const event: SentryEventLike = {
    breadcrumbs: [{ message: "wallet signing cancelled" }]
  };
  assert.equal(isRoutineWalletRejection(event), true);
});

test("scrubSentryEvent drops browser-extension noise", () => {
  const event: SentryEventLike = {
    exception: {
      values: [
        {
          value: "Failed to connect to MetaMask",
          stacktrace: { frames: [{ filename: "app:///scripts/inpage.js" }] }
        },
        { value: "MetaMask extension not found" }
      ]
    }
  };
  assert.equal(scrubSentryEvent(event), null);
});

test("scrubSentryEvent keeps a mixed-stack extension error", () => {
  const event: SentryEventLike = {
    exception: {
      values: [
        {
          value: "Failed to connect to MetaMask",
          stacktrace: {
            frames: [
              { filename: "app:///_next/static/chunks/main-app-abc123.js" },
              { filename: "chrome-extension://abcdef/scripts/inpage.js" }
            ]
          }
        }
      ]
    }
  };
  assert.notEqual(scrubSentryEvent(event), null);
});

test("collectEventMessages gathers message, exception, and breadcrumb text", () => {
  const messages = collectEventMessages({
    message: { formatted: "top level" },
    exception: { values: [{ type: "TypeError", value: "boom" }] },
    breadcrumbs: [{ message: "earlier" }]
  });
  assert.deepEqual(messages.sort(), ["TypeError", "boom", "earlier", "top level"]);
});

test("scrubSentryEvent drops cookies, authorization headers, and the request body", () => {
  const event = scrubSentryEvent({
    request: {
      url: "https://epora.example/api/v1/tx/lock-funds",
      headers: {
        Authorization: "Bearer secret-token",
        cookie: "session=secret",
        "Content-Type": "application/json",
        "X-API-KEY": "also-secret"
      },
      cookies: { session: "secret" },
      data: { receiver: PREPROD_ADDRESS, lovelace: "1000000" }
    },
    method: "POST"
  }) as NonNullable<ReturnType<typeof scrubSentryEvent>>;

  const request = event.request as Record<string, unknown>;
  assert.equal("cookies" in request, false);
  assert.equal("data" in request, false);
  const headers = request.headers as Record<string, unknown>;
  assert.equal("Authorization" in headers, false);
  assert.equal("cookie" in headers, false);
  assert.equal("x-api-key" in headers, false);
  assert.equal(headers["Content-Type"], "application/json");
});

test("scrubSentryEvent redacts wallet addresses and tx hashes from messages", () => {
  const event = scrubSentryEvent({
    message: `submit failed for ${TX_HASH} to ${STAKE_ADDRESS}`,
    exception: { values: [{ value: `unknown input ${TX_HASH}` }] }
  });
  const scrubbed = event as NonNullable<typeof event>;
  const message = scrubbed.message as string;
  assert.ok(!message.includes(TX_HASH));
  assert.ok(message.includes("[REDACTED]"));
  assert.ok(!scrubbed.exception?.values?.[0]?.value?.includes(TX_HASH));
});

test("scrubSentryEvent redacts addresses inside extra and contexts", () => {
  const event = scrubSentryEvent({
    extra: { note: `receiver ${PREPROD_ADDRESS}` },
    contexts: { wallet: { address: STAKE_ADDRESS, count: 2 } }
  }) as NonNullable<ReturnType<typeof scrubSentryEvent>>;

  assert.ok(!JSON.stringify(event.extra).includes("addr_test1"));
  assert.ok(!JSON.stringify(event.contexts).includes("stake_test1"));
  assert.equal((event.contexts as { wallet: { count: number } }).wallet.count, 2);
});

test("scrubSentryEvent drops body-shaped fields from breadcrumbs and redacts the rest", () => {
  const event = scrubSentryEvent({
    breadcrumbs: [
      {
        category: "fetch",
        message: `POST ${TX_HASH}`,
        data: { url: "/api/v1/tx/lock-funds", method: "POST", body: PREPROD_ADDRESS, status_code: 200 }
      },
      { category: "console", message: `hash ${TX_HASH}` }
    ]
  }) as NonNullable<ReturnType<typeof scrubSentryEvent>>;

  const fetchBreadcrumb = event.breadcrumbs?.[0] as { data?: Record<string, unknown> };
  assert.equal("body" in (fetchBreadcrumb.data ?? {}), false);
  assert.equal(fetchBreadcrumb.data?.status_code, 200);
  assert.ok(!JSON.stringify(event.breadcrumbs).includes(TX_HASH));
});

test("scrubSentryEvent survives a cyclic extra and redacts its strings", () => {
  const extra: Record<string, unknown> = { note: STAKE_ADDRESS };
  extra.self = extra;
  // Must not throw; the string fields come back redacted. The cycle itself is
  // the SDK's concern (its event normalizer cuts it before serialization).
  const event = scrubSentryEvent({ extra }) as NonNullable<ReturnType<typeof scrubSentryEvent>>;
  assert.equal((event.extra as { note: string }).note, "[REDACTED]");
});

function exceptionEvent(message: string): SentryEventLike {
  return { exception: { values: [{ value: message }] } };
}
