// DOM setup for component/hook tests run under Node's built-in test runner.
//
// The repo standardises on `node:test` (via tsx) rather than a second runner
// like vitest, so component tests get their DOM here: we spin up one jsdom
// window and expose the globals React + Testing Library expect, then wire
// Testing Library's cleanup() to run after every test.
//
// Loaded before the test files via `node --import tsx --import
// ./src/test/setup-dom.mjs --test 'src/**/*.test.tsx'` (see the
// `test:components` script). Written as plain .mjs so it stays outside the
// strict TypeScript lint/typecheck surface — it only touches global setup.
//
// ORDER MATTERS: @testing-library/dom binds its `screen` helper eagerly, at
// import time, to whatever `document.body` exists then. So we install the DOM
// globals FIRST and only afterwards dynamically import Testing Library — if we
// imported it statically at the top, ESM hoisting would evaluate it before the
// globals were set and `screen` would be permanently bound to an absent
// document.

import { JSDOM } from "jsdom";

const jsdom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true
});

const { window } = jsdom;

// Tell React it's running in a test ("act") environment.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

globalThis.window = window;
globalThis.document = window.document;

// Mirror the DOM constructors / helpers React DOM and Testing Library reach for,
// without clobbering Node's own globals (only fill what's missing).
const domGlobals = [
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "Element",
  "Node",
  "NodeList",
  "DocumentFragment",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "KeyboardEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "MutationObserver"
];

for (const key of domGlobals) {
  if (globalThis[key] === undefined && window[key] !== undefined) {
    globalThis[key] = window[key];
  }
}

// Import Testing Library and the test hooks only now that the DOM exists.
const { afterEach } = await import("node:test");
const { cleanup } = await import("@testing-library/react");

afterEach(() => {
  cleanup();
});
