import assert from "node:assert/strict";
import test from "node:test";
import { SHORTCUT_PREFIX_TIMEOUT_MS, createShortcutEngine } from "@/lib/shortcuts/engine";

/**
 * Pure unit tests for the shortcut matcher. The component tests in
 * `components/layout/shortcuts-help.test.tsx` drive the same branches through a DOM event
 * for a few regression cases; these cover the state machine directly, including the clock
 * (prefix expiry) and the Konami tracker, which a jsdom round-trip cannot observe.
 */

type EventOverrides = Partial<{
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isTypingTarget: boolean;
  isModalOpen: boolean;
}>;

function keyEvent(overrides: EventOverrides = {}) {
  return {
    key: "x",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    isTypingTarget: false,
    isModalOpen: false,
    ...overrides
  };
}

/** Fresh engine + mutable clock, so tests control prefix expiry exactly. */
function testEngine() {
  let now = 0;
  const engine = createShortcutEngine(() => now);
  return {
    advance(ms: number) {
      now += ms;
    },
    press: (overrides?: EventOverrides) => engine(keyEvent(overrides))
  };
}

test("the question mark opens the help dialog", () => {
  const { press } = testEngine();
  assert.deepEqual(press({ key: "?" }), { type: "openHelp" });
});

test("a bare c does not navigate", () => {
  const { press } = testEngine();
  assert.deepEqual(press({ key: "c" }), { type: "none" });
});

test("g arms the prefix as a swallowed key", () => {
  const { press } = testEngine();
  assert.deepEqual(press({ key: "g" }), { type: "swallow" });
});

for (const [second, target] of Object.entries({
  h: "/user?step=overview",
  s: "/user?action=send&step=configure",
  r: "/user?action=add-funds&step=configure",
  p: "/user?action=wallet-settings&task=settings-people&step=configure",
  w: "/user?action=wallet-settings&step=configure",
  u: "/user?action=manage-streaming-payments&step=configure"
})) {
  test(`g then ${second} navigates to ${target} and preserves the wallet`, () => {
    const { press } = testEngine();
    press({ key: "g" });
    assert.deepEqual(press({ key: second }), {
      type: "navigate",
      target,
      preserveWallet: true
    });
  });
}

test("g then c navigates to wallet creation and drops the wallet", () => {
  const { press } = testEngine();
  press({ key: "g" });
  assert.deepEqual(press({ key: "c" }), {
    type: "navigate",
    target: "/user?action=create-wallet&step=configure",
    preserveWallet: false
  });
});

test("the prefix is case-insensitive on the second key", () => {
  const { press } = testEngine();
  press({ key: "g" });
  const action = press({ key: "H" });
  assert.deepEqual(action, {
    type: "navigate",
    target: "/user?step=overview",
    preserveWallet: true
  });
});

test("any other key between g and the jump forgets the prefix", () => {
  const { press } = testEngine();
  press({ key: "g" });
  assert.deepEqual(press({ key: "x" }), { type: "none" });
  assert.deepEqual(press({ key: "c" }), { type: "none" });
});

test("the question mark also forgets an armed prefix", () => {
  const { press } = testEngine();
  press({ key: "g" });
  assert.deepEqual(press({ key: "?" }), { type: "openHelp" });
  assert.deepEqual(press({ key: "h" }), { type: "none" });
});

test("a second g re-arms the prefix", () => {
  const { press } = testEngine();
  press({ key: "g" });
  assert.deepEqual(press({ key: "g" }), { type: "swallow" });
  assert.deepEqual(press({ key: "h" }), {
    type: "navigate",
    target: "/user?step=overview",
    preserveWallet: true
  });
});

test("the prefix expires", () => {
  const { press, advance } = testEngine();
  press({ key: "g" });
  advance(SHORTCUT_PREFIX_TIMEOUT_MS);
  assert.deepEqual(press({ key: "h" }), { type: "none" });
});

test("the prefix survives until exactly the timeout", () => {
  const { press, advance } = testEngine();
  press({ key: "g" });
  advance(SHORTCUT_PREFIX_TIMEOUT_MS - 1);
  assert.deepEqual(press({ key: "h" }), {
    type: "navigate",
    target: "/user?step=overview",
    preserveWallet: true
  });
});

test("keys with a modifier are ignored and arm nothing", () => {
  for (const modifier of ["metaKey", "ctrlKey", "altKey"] as const) {
    const { press } = testEngine();
    assert.deepEqual(press({ key: "g", [modifier]: true }), { type: "none" });
    assert.deepEqual(press({ key: "h" }), { type: "none" });
  }
});

test("keys on a typing target are ignored and arm nothing", () => {
  const { press } = testEngine();
  assert.deepEqual(press({ key: "g", isTypingTarget: true }), { type: "none" });
  assert.deepEqual(press({ key: "h" }), { type: "none" });
});

test("keys while a modal owns the screen are ignored and arm nothing", () => {
  const { press } = testEngine();
  assert.deepEqual(press({ key: "g", isModalOpen: true }), { type: "none" });
  assert.deepEqual(press({ key: "h" }), { type: "none" });
});

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a"
];

test("the full konami code opens the easter egg", () => {
  const { press } = testEngine();
  for (const [index, key] of KONAMI.entries()) {
    const action = press({ key });
    if (index === KONAMI.length - 1) {
      assert.deepEqual(action, { type: "showEasterEgg" });
    } else {
      assert.deepEqual(action, { type: "none" });
    }
  }
});

test("a wrong key resets the konami run", () => {
  const { press } = testEngine();
  press({ key: "ArrowUp" });
  press({ key: "ArrowUp" });
  press({ key: "ArrowDown" });
  press({ key: "q" });
  // One wrong key, then the whole code from the start: still completes.
  let action = null;
  for (const key of KONAMI) {
    action = press({ key });
  }
  assert.deepEqual(action, { type: "showEasterEgg" });
});

test("a wrong key that matches the first code key keeps the run alive", () => {
  const { press } = testEngine();
  // Up Up Down advances three steps; the stray Up is a wrong continuation (the code
  // needs Down) but matches the code's first key, so the run restarts at one instead
  // of dying.
  for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowUp"]) {
    assert.deepEqual(press({ key }), { type: "none" });
  }
  // The restart counts as step one, so the remaining nine keys finish the code.
  let action = null;
  for (const key of KONAMI.slice(1)) {
    action = press({ key });
  }
  assert.deepEqual(action, { type: "showEasterEgg" });
});

test("the konami code does not reach behind a modal", () => {
  const { press } = testEngine();
  for (const key of KONAMI) {
    assert.deepEqual(press({ key, isModalOpen: true }), { type: "none" });
  }
});

test("any key between g and the konami code forgets the prefix", () => {
  const { press } = testEngine();
  press({ key: "g" });
  // The code's first key is an arrow, which is neither the second jump key nor `g`,
  // so the armed prefix dies here -- the same fall-through the handler always had.
  for (const key of KONAMI) {
    press({ key });
  }
  assert.deepEqual(press({ key: "h" }), { type: "none" });
});
