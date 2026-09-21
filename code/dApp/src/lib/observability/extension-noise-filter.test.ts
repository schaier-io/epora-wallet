import assert from "node:assert/strict";
import test from "node:test";

import { isBrowserExtensionNoise, isExtensionFrameFilename } from "./extension-noise-filter";
import type { SentryEventLike } from "./sentry-scrub";

// The real shape from Sentry issue EPORA-WALLET-3 (#533): the MetaMask
// inpage script threw with the extension scheme stripped by injection, and
// Sentry chained the inner "extension not found" cause without frames.
test("drops the observed MetaMask inpage event shape", () => {
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
  assert.equal(isBrowserExtensionNoise(event), true);
});

test("drops events whose every frame uses an extension scheme", () => {
  for (const filename of [
    "chrome-extension://abcdef/scripts/inpage.js",
    "moz-extension://uuid/content.js",
    "safari-web-extension://uuid/inpage.js",
    "extension://uuid/inpage.js"
  ]) {
    const event: SentryEventLike = {
      exception: { values: [{ value: "boom", stacktrace: { frames: [{ filename }] } }] }
    };
    assert.equal(isBrowserExtensionNoise(event), true, `expected drop: ${filename}`);
  }
});

test("drops events whose every frame is a known injected-script basename", () => {
  for (const filename of [
    "https://www.epora.io/scripts/inpage.js",
    "inpage.min.js",
    "contentScript.js",
    "content-script-1234.js",
    "sub/dir/injected.mjs"
  ]) {
    assert.equal(isExtensionFrameFilename(filename), true, `expected match: ${filename}`);
  }
});

test("reads frames from the event-level stacktrace too", () => {
  const event: SentryEventLike = {
    message: "Failed to connect to MetaMask",
    stacktrace: { frames: [{ filename: "app:///scripts/inpage.js" }] }
  };
  assert.equal(isBrowserExtensionNoise(event), true);
});

test("mixed stacks across chained exception values stay reported", () => {
  const event: SentryEventLike = {
    exception: {
      values: [
        {
          value: "Failed to connect to MetaMask",
          stacktrace: { frames: [{ filename: "chrome-extension://abcdef/scripts/inpage.js" }] }
        },
        {
          value: "outer app failure",
          stacktrace: { frames: [{ filename: "app:///_next/static/chunks/main-app-abc123.js" }] }
        }
      ]
    }
  };
  assert.equal(isBrowserExtensionNoise(event), false);
});

test("keeps events with mixed stacks", () => {
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
  assert.equal(isBrowserExtensionNoise(event), false);
});

test("keeps ordinary app and server frames", () => {
  for (const filename of [
    "app:///_next/static/chunks/pages-user-abc123.js",
    "https://www.epora.io/_next/static/chunks/main-app.js",
    "webpack-internal:///./src/providers/wallet-provider.tsx",
    "webpack-internal:///./src/lib/wallet/injection.ts"
  ]) {
    assert.equal(isExtensionFrameFilename(filename), false, `expected keep: ${filename}`);
  }
});

test("drops a stackless event matching a known extension failure phrase", () => {
  const event: SentryEventLike = {
    exception: { values: [{ type: "Error", value: "Extension context invalidated" }] }
  };
  assert.equal(isBrowserExtensionNoise(event), true);
});

test("drops a message-only event matching a known extension failure phrase", () => {
  const event: SentryEventLike = { message: "Failed to connect to MetaMask" };
  assert.equal(isBrowserExtensionNoise(event), true);
});

test("drops a formatted message object matching a known extension failure phrase", () => {
  const event: SentryEventLike = {
    message: { formatted: "Failed to connect to MetaMask" }
  };
  assert.equal(isBrowserExtensionNoise(event), true);
});

test("keeps an app error that only mentions the phrase in a breadcrumb", () => {
  const event: SentryEventLike = {
    message: "TypeError: cannot read properties of undefined",
    breadcrumbs: [{ message: "Error restoring session: Failed to connect to MetaMask" }]
  };
  assert.equal(isBrowserExtensionNoise(event), false);
});

test("a frame without a filename falls through to the message layer", () => {
  const dropped: SentryEventLike = {
    exception: { values: [{ value: "Extension context invalidated", stacktrace: { frames: [{}] } }] }
  };
  assert.equal(isBrowserExtensionNoise(dropped), true);

  const kept: SentryEventLike = {
    exception: { values: [{ value: "cannot read properties of undefined", stacktrace: { frames: [{}] } }] }
  };
  assert.equal(isBrowserExtensionNoise(kept), false);
});

test("an empty event is not extension noise", () => {
  assert.equal(isBrowserExtensionNoise({}), false);
});
